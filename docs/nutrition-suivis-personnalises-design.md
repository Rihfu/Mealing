# Nutrition — Suivis personnalisés par facettes (design validé, remplace les personas)

**Date : 2026-07-06 · Statut : CONCEPTION VALIDÉE (pivot acté avec l'utilisateur), implémentation à lancer.**
Remplace la section « Personas » (§5) de `nutrition-refonte-audit.md`. Les personas N1 (commit `4508794`)
sont **abandonnés comme concept central** — jugés trop rigides, peu personnalisables, pas user-friendly :
un vrai utilisateur est une COMBINAISON (végétarienne + course à pied + concours à préparer), pas une case.

## 1. Le modèle en une ligne

```
FACETTES (multi-sélection : activités / alimentation / objectifs — tout optionnel)
   ↓
MOTEUR DE RÈGLES CURÉ (table BDD lecture seule : facettes → suivi + POURQUOI + cible sourcée)
   ↓
PLAN DE SUIVI PERSONNEL (cartes explicables, activables, réglables, retirables une à une)
```

Trois arbitrages utilisateur (2026-07-06) :
1. **Pivot complet** — le persona disparaît (le mode enfant survit : propriété du profil, pas un persona).
2. **Suivis d'habitudes = pilier de la V1** (voir §3 — c'est le débloqueur collagène/oméga-3).
3. **Règles de recommandation en TABLE BDD curée** (lecture seule comme `nutrient_reference` — leçon S3),
   pas en module code : éditables sans redéploiement, extensibles (principe n°8), prêtes pour l'échelle.

## 2. Les facettes V1 (référentiel curé, extensible)

Groupe `activite` : `sport_force` (muscu/force) · `sport_impact` (course & sports d'impact) ·
`sport_endurance` (vélo, natation…) · `travail_cognitif` (études/travail intellectuel) ·
`metier_physique` · `sedentaire` · `fatigue` (« souvent fatigué·e » — formulation bien-être).

Groupe `alimentation` : `vegetarien` · `vegan` · `peu_poisson` · `peu_laitages`.

Groupe `objectif` : `obj_equilibre` (défaut) · `obj_poids` (perte douce) · `obj_muscle` (muscle/perf) ·
`obj_articulations` · `obj_memoire` (mémoire/concentration) · `obj_energie` · `obj_immunite` ·
`obj_longevite` (vieillir en forme).

Le « qui » (année de naissance, sexe, poids, taille, activité générale) reste dans `nutrition_profile`
(privé, RLS personnelle) — les règles peuvent le combiner (ex. fer renforcé si sexe F).
**Enfant** : `nutrition_profile.is_child` (migré depuis persona='enfant') — kcal jamais affichées/ciblées.

## 3. Deux types de suivis (l'insight clé)

| Type | Exemple | Données | Nouveauté |
|---|---|---|---|
| **Quantitatif** (existant) | protéines ≥ 120 g/j, fer ≥ 16 mg | valeurs USDA/OFF des ingrédients (garde-fou n°3) | + oméga-3, magnésium, zinc à AJOUTER dans `nutrient_type` (USDA les couvre ; étendre le mapping du provider) |
| **Habitude** (NOUVEAU, pilier V1) | poisson gras 2×/sem · légumineuses 2×/sem · 5 fruits-légumes/j · sources de collagène 1×/sem · noix 1×/j · « 4 légumes différents/sem » (enfant) | les REPAS PLANIFIÉS eux-mêmes : comptage d'occurrences d'aliments taggés — zéro donnée nutritionnelle requise | tags de groupes sur le catalogue (`poisson_gras`, `legumineuse`, `fruit`, `legume`, `noix_graine`, `source_collagene`…) |

Pourquoi c'est LE bon format : (a) le **collagène n'existe dans aucune base nutritionnelle** → un suivi
en mg violerait le garde-fou n°3 ; en habitude (« sources de collagène 1×/sem »), il devient possible et
honnête. (b) Les **vrais repères ANSES sont formulés en habitudes** (« poisson 2×/sem dont un gras »,
« légumineuses 2×/sem »). (c) C'est l'**atout unique de Mealing** : on connaît l'assiette planifiée —
personne d'autre ne peut compter les occurrences sans saisie. (d) Mode enfant naturel (variété, zéro chiffre).

## 4. Modèle de données (tables à créer — toutes additives)

- `facet` (référentiel curé, lecture seule) : `key`, `label`, `groupe` (activite|alimentation|objectif), `ordre`.
- `profile_facet` (`profile_id`, `facet_key`) — RLS **strictement personnelle** (comme `nutrition_profile`).
- `habit_type` (référentiel curé, lecture seule) : `key`, `label`, `description`, `target_count`,
  `period` (day|week), `match_tags` (tags d'aliments comptés), `distinct_mode` (occurrences OU aliments distincts — pour la variété enfant).
- `profile_habit_tracking` (`profile_id`, `habit_key`, `target_count` (override), `enabled`) — RLS personnelle.
- `tracking_rule` (curée, LECTURE SEULE — cœur du moteur) : `required_facets text[]` (toutes requises = ET ;
  le OU s'exprime par plusieurs règles), `sex`/`age_min`/`age_max` (optionnels), `kind` (nutrient|habit),
  `nutrient_code` OU `habit_key`, `why_text` (le « pourquoi » affiché, ton bien-être sourcé), `priority`.
- `food_tag` (`food_id`, `tag`) + référentiel `food_group` (`tag`, `label`) : seed curé sur le catalogue
  (~340 aliments), complété à la création d'un aliment par l'IA en best-effort (classement factuel,
  comme le rayon — les VALEURS nutritionnelles restent du fournisseur).
- Existant conservé tel quel : `nutrition_profile` (le champ `persona` devient legacy, remplacé par
  `is_child` + facettes), `profile_nutrient_tracking`, `profile_goal` (zones min/max), `nutrient_reference`.

Évaluation du moteur : recommandations = règles dont `required_facets ⊆ facettes du profil` (+ filtres
âge/sexe), triées par `priority`, **plafonnées à ~6** (la pertinence EST le produit), en excluant le déjà-suivi.
Cible d'un suivi quantitatif = logique `computeNutritionTargets` existante (référence/formule) ; cible d'une
habitude = `target_count` de la règle/du référentiel.

## 5. Règles V1 (catalogue curé de départ — à seed)

| Facettes (ET) | Suivi | Pourquoi (résumé du why_text) |
|---|---|---|
| sport_force | protéines (quanti, g/kg) | construction et réparation musculaires |
| obj_muscle | protéines (quanti, g/kg) | idem (règle distincte = OU) |
| sport_impact | sources de collagène 1×/sem (habitude) | tendons/cartilages sollicités par les impacts |
| obj_articulations | sources de collagène + oméga-3 | confort articulaire |
| sport_endurance | glucides (quanti) | carburant de l'effort long |
| sport_endurance | fer (quanti, renforcé si F) | pertes accrues (hémolyse d'effort) |
| travail_cognitif | oméga-3 (quanti + habitude poisson gras 2×/sem) | DHA et fonctionnement normal du cerveau |
| obj_memoire | idem | idem |
| vegetarien | B12, fer | absents/moins absorbés sans chair animale |
| vegan | B12, fer, calcium + légumineuses 2×/sem | couverture sans produits animaux |
| peu_poisson | oméga-3 (habitude : alternatives noix/colza) | apport sans poisson |
| peu_laitages | calcium | principal vecteur écarté |
| obj_poids | énergie (déficit doux), protéines (satiété), sucres ≤ | déficit tenable |
| obj_energie / fatigue | fer, magnésium, vitamine D | minéraux et fatigue |
| obj_immunite | vitamine D, zinc | contribution au fonctionnement immunitaire |
| obj_longevite | fibres, protéines, 5 fruits-légumes/j | socle longévité (sarcopénie, microbiote) |
| âge ≥ 60 | protéines, calcium, vitamine D | os et masse musculaire |
| (socle, tous) | 5 fruits & légumes/j, fibres | repère universel PNNS |
| enfant | variété légumes (4 différents/sem), calcium, fer — JAMAIS kcal | croissance, sans anxiété des chiffres |

**Ton (non négociable)** : factuel, sourcé, registre bien-être (« repère ANSES », « certains sportifs
veillent à… ») — jamais prescriptif ni médical. Mention « ceci n'est pas un avis médical » conservée.

## 5 bis. La longue traîne — l'utilisateur spécifique SANS carte préenregistrée (ajout 2026-07-06)

Les règles curées couvrent la TÊTE de la distribution ; elles amorcent, elles ne bornent jamais.
Quatre mécanismes d'échappement pour le besoin non anticipé (« mon médecin m'a dit de limiter le
potassium », « je grimpe → magnésium », « fermenté 3×/sem », « je veux suivre l'iode ») :

1. **Catalogue étendu cherchable** : ~30-40 nutriments pré-mappés USDA (iode, potassium, sélénium,
   folates, K, E…) dans `nutrient_type`, cachés par défaut, trouvables via la recherche de « Gérer mes
   suivis ». Extension unique du mapping provider — aucune règle à anticiper.
2. **Constructeur d'habitude personnalisée** (le plus puissant) : l'utilisateur compose SA règle —
   direction (**au moins / au plus** — la limite compte autant que l'objectif) × N fois × jour/semaine ×
   ce qui compte (tags existants OU sélection libre d'aliments du catalogue). Zéro IA, zéro valeur
   inventée : c'est sa règle, on la compte contre le planning. Ex. « fermentés ≥ 3×/sem », « viande
   rouge ≤ 2×/sem ». Stockage : `profile_habit_tracking` avec `custom_label` + `match_food_ids`/
   `match_tags` + `direction`.
3. **Mode observation + cible personnelle** : suivre SANS objectif (déjà permis par le modèle — un suivi
   sans `profile_goal` ; l'assumer dans l'UI) ; ou cible saisie par l'utilisateur (médecin/coach), badge
   « cible personnelle » — l'app ne la valide pas, elle la compte (jamais inventée par l'app).
4. **L'assistant IA comme interprète** (N3) : besoin exprimé en langage naturel → l'agent le TRADUIT en
   configuration via les mêmes fonctions core (activer un suivi, créer une habitude custom), sous plan
   confirmé (garde-fou n°1). Donnée inexistante (créatine, collagène en mg) → il explique honnêtement et
   propose l'équivalent habitude. L'IA CONFIGURE, ne calcule jamais une valeur (n°3).

Garde-fous imposés par la traîne :
- **Indicateur de couverture PAR SUIVI** (« couvert à 60 % par tes ingrédients cette semaine ») — les
  micros rares sont souvent absents des fiches → sans lui, un suivi iode afficherait des zéros trompeurs
  (la maladie guérie en N0). Généraliser le pattern de couverture N0 au niveau du suivi.
- **La traîne nourrit la tête** : recherches sans résultat dans « Gérer mes suivis » loggées (télémétrie
  interne) → radar de curation des prochaines règles/habitudes (cap commercial).

Phasage : catalogue étendu + mode observation + cible perso = **N1.5** (quasi gratuits) ; constructeur
d'habitude custom = **N1.5 si le budget le permet, sinon N1.6 dédié** ; interprète assistant = **N3**.

## 6. Parcours UX

1. **Onboarding 3 écrans en chips multi-sélection** (remplace le choix de persona) : « Qu'est-ce qui te
   ressemble ? » (activités) → « Comment tu manges ? » (alimentation) → « Qu'est-ce qui compte pour toi ? »
   (objectifs). Tout optionnel, skippable. Infos corporelles : écran existant conservé.
2. **« Ton plan de suivi »** : cartes recommandées AVEC leur pourquoi (« recommandé parce que tu as coché
   course à pied + articulations »), pré-cochées, cibles modifiables → Appliquer.
3. **Section Nutrition** : jauges quantitatives (existant) + **cartes d'habitudes** (« Poisson gras 1/2
   cette semaine ✓ » — comptées depuis le planning).
4. **« Gérer mes suivis »** : catalogue complet consultable (chaque suivi = explication + source), badge
   « recommandé pour toi », ajout/retrait libre. Le profil est modifiable à tout moment → recalcul.
5. Plus tard (N3) : suggestions dérivées du comportement (« 0 poisson planifié ce mois-ci → … »).

## 7. Impact sur l'existant (faible — N1 a construit la plomberie)

Conservé : `nutrition_profile` (privée), `nutrient_reference`, `computeNutritionTargets` (logique par
nutriment), `profile_nutrient_tracking` + `profile_goal` (zones), coquille du wizard, mode enfant 3 niveaux.
Remplacé : le champ `persona` (→ `is_child` + facettes ; `PERSONAS` supprimé à terme), l'écran 1 du wizard.
Données : le profil SAWADA (sportif) garde ses objectifs/suivis (toujours valides) ; facettes vides au
départ, re-passage par le wizard quand voulu.

## 8. Vigilances

1. **Couverture données** : oméga-3/magnésium/zinc = ajout `nutrient_type` + extension du mapping
   provider USDA (codes nutriments). Collagène = habitude UNIQUEMENT (aucune base ne le couvre).
2. **Plafond de recommandations** (~6) — ne pas noyer.
3. **Tags d'aliments** : seed curé du catalogue (passe IA assistée puis relecture humaine) ; nouveau
   aliment → tag IA best-effort (classement factuel, valeurs jamais touchées).
4. **Comptage d'habitudes** = approximation assumée (principe n°2) : une occurrence = un repas planifié
   contenant un ingrédient taggé ; affiché comme repère, pas comme vérité.

## 9. Phasage révisé

- **N1.5 — Pivot facettes (1-2 sessions)** : migrations (facet/profile_facet/habit_type/
  profile_habit_tracking/tracking_rule/food_tag + seeds curés + `is_child`) ; moteur de recommandations ;
  refonte wizard (chips + plan de suivi) ; comptage d'occurrences depuis le planning ; cartes habitudes
  sur la page ; nutriments oméga-3/magnésium/zinc + mapping provider.
- **N2 — Dashboard (handoff Claude Design)** : le brief intègre les DEUX types de suivis (jauges + habitudes).
- N3/N4 inchangés (N4 gamification s'appuie naturellement sur les habitudes — défis variété du foyer).
