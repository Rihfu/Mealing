# Audit stratégique — Refonte de la section Nutrition

**Date : 2026-07-05 · Statut : PROPOSITION à valider (règle de travail : rien n'est implémenté sans accord).**
Analyse marché fondée sur les connaissances du marché des apps nutrition à début 2026 (pas de recherche web
dans cette passe — les ordres de grandeur sont stables ; à re-vérifier ponctuellement si un chiffre doit être cité publiquement).

---

## 1. Résumé exécutif

La section Nutrition actuelle est un **tableau de chiffres sans usage** — et l'audit des données révèle
pire : elle affiche des **zéros partout** car la chaîne de données n'a jamais été amorcée (0 ingrédient de
recette lié au catalogue → 0 valeur nutritionnelle calculable → 0 objectif saisi). Le problème n'est donc
pas cosmétique : il faut (1) **réparer la tuyauterie de données**, (2) **repositionner la section** comme le
« copilote nutrition du foyer » — la seule promesse que le marché n'offre pas et que notre architecture rend
naturelle : *voir ses apports sans rien saisir, comprendre en 5 secondes, agir en 1 clic*.

**Atout maître de Mealing** : chez tous les concurrents, la nutrition part de l'assiette (saisie manuelle,
photo, scan) — la corvée de *logging* est LA cause n°1 d'abandon du marché. Chez nous, la nutrition découle
**automatiquement du planning familial** (principe n°1 : un repas planifié = mangé). Zéro saisie. Personne
d'autre ne tient cette promesse, et personne ne la tient **au niveau du foyer** (multi-profils natifs).

---

## 2. État des lieux

### 2.1 Le produit aujourd'hui

- **UI** (`src/app/(app)/nutrition/page.tsx`) : 2 tableaux statiques (« Aujourd'hui », « Cette semaine »,
  colonnes planifié / réel estimé / objectif) + un formulaire d'objectifs quotidiens (max/jour uniquement).
  Aucune visualisation, aucune interprétation, aucune action possible depuis la page.
- **Backend** (`core/nutrition.ts`) : `aggregatePeriodNutrition` (planifié vs réel avec écarts, période
  arbitraire) — sain et récemment optimisé (N+1 supprimé). **Mais** : approximation « 1 portion par repas »
  codée en dur — `planned_meal.servings` (migration 0031) n'est **pas** utilisé, ni les quantités de
  `real_consumption`.
- **Schéma : en avance sur l'UI** (Phase 0 bien conçue, principe n°8) :
  - `nutrient_type` extensible (11 types de base seedés : énergie, macros, fer, calcium, D, B12, fibres, sucres, sodium) ;
  - `profile_goal` : min **et** max, période `daily`/`weekly` — l'UI n'exploite que max/daily ;
  - `profile_nutrient_tracking` (nutriments suivis par profil) : **existe depuis la Phase 0, jamais branchée** ;
  - `nutrition_share` : privé par défaut, partage volontaire — conforme RGPD-santé dès le départ.

### 2.2 Les données réelles (requête du 2026-07-05, base de prod)

| Mesure | Valeur | Conséquence |
|---|---|---|
| Recettes / ingrédients | 5 / 13 | — |
| Ingrédients liés au catalogue (`food_id`) | **0** | `computeRecipeNutrition` les ignore tous |
| Ingrédients avec valeurs nutritionnelles | **0** | **la page affiche 0 partout** |
| Objectifs saisis (`profile_goal`) | 0 | la colonne Objectif est vide |
| Écarts enregistrés (`real_consumption`) | 0 | « réel » = « planifié » |
| Repas planifiés avec portions (30 j) | 0/5 | même réparée, l'agrégation serait fausse |

**Diagnostic** : les recettes existantes datent d'avant le lien automatique ingrédient→catalogue
(`resolveOrCreateFoodId`, branché plus tard dans `createRecipe`). L'action de backfill
(`backfillRecipeIngredientLinks`) existe mais n'a jamais été passée sur ces données ; et même liés, les
aliments n'ont de nutrition qu'à la demande (fiche produit). **Aucune refonte UI n'a de sens sans réparer
cette chaîne d'abord.**

---

## 3. Le marché : besoins réels et failles des acteurs

### 3.1 Les douleurs universelles (par ordre d'importance)

1. **La corvée de saisie (« logging fatigue »)** — saisir 3×/jour tue la rétention ; l'immense majorité des
   utilisateurs d'apps de tracking abandonnent en quelques semaines. Photo-IA (Foodvisor) et scan (Yazio)
   ne font qu'atténuer. *Mealing la supprime par construction.*
2. **Des chiffres sans décision** — les apps montrent des données ; l'utilisateur veut savoir **quoi manger
   ce soir**. Aucun grand acteur ne referme la boucle chiffres → recette → courses. *Nous avons déjà les
   briques : recettes, stock, liste de courses, prix, agent IA.*
3. **Des cibles taille unique** — la personnalisation sérieuse est presque toujours premium, et rarement
   liée au mode de vie réel (sportif, étudiant, enfant, senior).
4. **L'individu, jamais le foyer** — tout le marché est mono-utilisateur ; cuisiner pour 4 avec des besoins
   différents n'est traité nulle part. *Nos profils + repas partagés/individuels le permettent nativement.*

### 3.2 Segments et besoins (personas cibles)

| Persona | Besoin nutritionnel dominant | Ce que Mealing peut offrir d'unique |
|---|---|---|
| **Gestion du poids** (plus gros segment du marché) | kcal, protéines (satiété), sucres | cibles douces + le planning qui « pré-décide » (moins de décisions impulsives) |
| **Sportif force** | protéines (g/kg), kcal | preset dédié, score hebdo protéines, recettes riches en protéines réalisables avec le stock |
| **Sportif endurance** | glucides, fer | idem, cibles orientées glucides |
| **Étudiant / budget** | manger correct pas cher | croisement nutrition × **prix** (historique des prix des courses — unique sur le marché) |
| **Bureau / sédentaire** | équilibre simple, batch cooking | restes + planning déjà là ; « score équilibre » sans comptage fin |
| **Végétarien / végan** | B12, fer, calcium, protéines | presets micro ciblés (types déjà en base) |
| **Famille / enfants** | équilibre, variété — **PAS de comptage kcal** (éthique/TCA) | mode enfant : variété/légumes, jamais de calories affichées — argument fort et différenciant |
| **Senior** | protéines, calcium, D | preset dédié |

### 3.3 Concurrents et leurs limites

- **MyFitnessPal** (leader mondial) : base crowdsourcée imprécise, saisie lourde, premium cher, aucune boucle repas→courses.
- **Yazio / Lifesum** : jolis, gamifiés, mais superficiels et mono-utilisateur.
- **Cronometer** : la référence micro-nutriments (précis) mais austère, expert-only, zéro lien avec la vie réelle (courses/stock).
- **Foodvisor** (FR) : photo-IA séduisante, précision réelle discutable, pas de planification.
- **Yuka** (FR, énorme audience) : score produit au scan — **pas** de suivi d'apports ; prouve l'appétit FR pour la nutrition simple et bienveillante.
- **MacroFactor / MyNetDiary** : niches sérieuses (coaching macro adaptatif) — mono-utilisateur, saisie quotidienne obligatoire.

**Position à prendre** : *« la nutrition qui découle de ta vie, pas une deuxième corvée »* — précision
approximative **assumée et affichée** (principe n°2) contre la fausse précision du marché, foyer-first,
et le seul produit où le conseil débouche sur une action concrète (planifier/acheter).

---

## 4. Vision proposée : de « tableau de chiffres » à « boucle d'accompagnement »

Trois promesses, dans cet ordre :

1. **Tu vois sans saisir** — les apports dérivent du planning (portions comprises) ; l'honnêteté est
   affichée (« semaine couverte à 80 % par des données nutritionnelles » plutôt qu'un faux chiffre précis).
2. **Tu comprends en 5 secondes** — jauges vers ta zone cible (pas des tables), un score hebdo bienveillant,
   3 informations max par écran.
3. **Tu peux agir en 1 clic** — « il te manque ~40 g de protéines cette semaine → voici 3 recettes riches en
   protéines **réalisables avec ton stock** → ajouter au planning / à la liste de courses ». L'agent IA
   conseille en s'appuyant sur les chiffres de la base (interpréter : oui ; inventer une valeur : jamais —
   garde-fou n°3).

---

## 5. Personnalisation (cœur de la demande)

> **⚠️ SECTION REMPLACÉE (2026-07-06)** — le concept de personas a été implémenté (N1, commit `4508794`)
> puis **abandonné comme concept central** après retour utilisateur (trop rigide, peu personnalisable,
> pas user-friendly : un utilisateur réel est une COMBINAISON, pas une case). Nouveau modèle validé :
> **facettes → moteur de règles curé → suivi à la carte (quantitatif + habitudes)**.
> **Voir `docs/nutrition-suivis-personnalises-design.md`** (document de référence du pivot).
> La plomberie N1 (nutrition_profile privée, nutrient_reference, zones min/max, tracking) est conservée.

- **Presets par persona** à l'activation de la section (3 écrans max) : Équilibre (défaut) · Sportif force ·
  Sportif endurance · Perte de poids douce · Végétarien/végan · Étudiant budget · Senior · **Enfant** (mode
  famille : variété/équilibre, kcal jamais affichées). Chaque preset = nutriments suivis + méthode de cible.
- **Cibles calculées, jamais inventées** : kcal via formule standard (Mifflin-St Jeor × facteur d'activité,
  à partir d'infos corporelles **optionnelles** — sans elles, apports de référence par âge/sexe) ; protéines
  en g/kg selon persona ; micro-nutriments = **apports de référence ANSES/EFSA stockés dans une table curée
  `nutrient_reference`** (âge/sexe) — données de référence, pas de LLM (garde-fou n°3), structure extensible
  (principe n°8).
- **Réglage fin** : chaque cible modifiable ; nutriments ajoutables/retirables par profil via
  `profile_nutrient_tracking` (la table dort depuis la Phase 0) ; `nutrient_type` accueille de nouveaux
  nutriments (magnésium, potassium, oméga-3…) selon la couverture USDA/OFF.
- **Périodes** : objectifs par jour ET par semaine (`profile_goal.period` le permet déjà) ; lectures jour /
  semaine / mois / 6 mois (tendances). L'hebdo est l'unité de bienveillance : un excès ponctuel se lisse.

## 6. Objectifs longue durée & récompenses (gamification sobre)

- **Score hebdo de respect** par plages (`target_min`…`target_max` + tolérance) — jamais de binaire parfait/raté.
- **Streaks** de semaines « dans la zone », **badges virtuels** (paliers, découverte : « 5 recettes riches en
  fer cuisinées », « 10 légumes différents ce mois-ci »), **défis foyer** opt-in (« 5 légumes différents cette
  semaine » — compatible enfants).
- **Garde-fous éthiques (non négociables, et argument commercial/app-store)** : langage positif, pas de rouge
  punitif quotidien, **jamais de kcal affichées sur un profil enfant**, gamification désactivable, mention
  claire « ceci n'est pas un avis médical ». Rester côté bien-être, loin de la frontière dispositif médical.

---

## 7. Plan de refonte proposé (phases livrables indépendamment)

| Phase | Contenu | Dépend de | Effort estimé |
|---|---|---|---|
| **N0 — Réparer la chaîne de données** *(prérequis absolu)* | Backfill liens ingrédients→catalogue des recettes existantes (l'action existe) ; complétion des valeurs nutritionnelles des aliments utilisés (réutiliser `fetchAndStoreNutrition` + `mapLimit`, comme le pré-chargement offline) ; **intégrer `planned_meal.servings`** et les quantités de `real_consumption` dans `aggregatePeriodNutrition` ; complétion nutrition en tâche de fond à la sauvegarde d'une recette ; **indicateur de couverture** (« % de la semaine couvert ») affiché. | — | 1-2 sessions |
| **N1 — Profils & objectifs personnalisés** | Migration `nutrient_reference` (AJR ANSES/EFSA curés par âge/sexe) + champs profil optionnels (année de naissance, sexe, poids, taille, activité, persona) ; onboarding nutrition (persona → infos optionnelles → cibles proposées modifiables) ; branchement de `profile_nutrient_tracking` (choix des nutriments suivis) ; mode enfant. | N0 | 2 sessions |
| **N2 — Dashboard utile** *(passage Claude Design)* | Jour : jauges par nutriment suivi (planifié vs réel vs zone) ; semaine/mois : tendances, moyennes, score hebdo, top contributeurs (« d'où viennent tes protéines », par recette) ; cache-first PWA (parité sections). | N0 (N1 pour les zones) | 2 sessions |
| **N3 — Boucle actionnable** | « Gap → recettes » : croiser le manque hebdo avec `recommend_recipes` (réalisables avec le stock) → ajout 1-clic planning/courses ; outils agent IA (lecture : statut nutritionnel, cibles) ; **saisie express d'un extra hors-plan** (2 gestes) pour combler le trou du « réel ». | N0-N2 | 1-2 sessions |
| **N4 — Objectifs longue durée & récompenses** | Migration `nutrition_achievement` ; streaks, badges, score hebdo historisé, défis foyer opt-in ; garde-fous éthiques. | N2 | 1-2 sessions |

**Total estimé : ~7-9 sessions.** Chaque phase apporte une valeur seule ; on peut s'arrêter après n'importe laquelle.

### Conformité aux principes directeurs

n°1 (le réel dérive du plan, écarts seulement) ✓ · n°2 (approximation assumée + affichée) ✓ ·
n°3 (AJR = table curée, calculs déterministes ; l'IA interprète, n'invente jamais) ✓ ·
n°7 (la présente proposition chiffre l'extension) ✓ · n°8 (`nutrient_type`/`nutrient_reference`/
`profile_nutrient_tracking` extensibles) ✓.

---

## 8. Décisions à trancher avant de commencer

1. **Personas V1** : je propose de démarrer à 5 (Équilibre, Sportif, Perte de poids douce, Végétarien, Enfant) — les autres en presets ultérieurs.
2. **Infos corporelles optionnelles** (poids/taille/âge/sexe) : OK pour les demander ? (renforce les cibles ; données sensibles → restent privées sous RLS, jamais partagées par défaut).
3. **Extras hors-plan** (N3) : inclure la saisie express, ou assumer le « plan-only » en V1 ?
4. **Source des AJR** : ANSES (FR, marché cible) d'abord, EFSA en complément — à confirmer.
5. **Défis foyer** : V1 de la gamification ou différé ?
6. **Périmètre design** : N2 mérite-t-il un handoff Claude Design complet (comme Planning) ? (recommandé)

### ✅ Arbitrages tranchés (2026-07-06)

1. **Personas V1 = 5** : Équilibre, Sportif, Perte de poids douce, Végétarien, Enfant. Autres personas en presets ultérieurs.
2. **Infos corporelles = OUI, optionnelles** : poids/taille/année de naissance/sexe demandés mais jamais obligatoires ; privées sous RLS, non partagées par défaut ; affinent les cibles.
3. **Extras hors-plan = OUI en V1** (N3) : saisie express (2 gestes) pour combler le trou du « réel ».
4. **AJR = ANSES d'abord** (marché FR), EFSA en complément ; valeurs curées, jamais générées par IA (garde-fou n°3).
5. **Défis foyer = OUI en V1** (N4) : gamification sobre, anti-TCA, dès la première version.
6. **Design N2 = handoff Claude Design complet** (comme Planning) avant de coder le dashboard.

→ **N1→N4 sont désormais cadrés.** N0 (chaîne de données) reste le prérequis à démarrer en premier — indépendant de ces arbitrages.
