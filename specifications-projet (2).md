# Spécifications du projet — Application de planification repas, nutrition et courses

**Statut** : document de référence définitif. Remplace toute version antérieure. Toute décision listée ici est considérée actée ; toute remise en cause doit être explicite et assumée, pas un ajout silencieux en cours de route.

---

## 1. Contexte et objectif

Projet développé en solo, disponibilité estimée à 10-20h/semaine, budget initial à zéro (services gratuits uniquement ; hébergement payant envisagé seulement si un palier gratuit est réellement et durablement dépassé). Usage personnel, partagé avec un foyer de deux personnes à ce jour, avec une architecture conçue pour ne pas bloquer un foyer plus grand plus tard.

**Objectif central** : réduire la charge mentale liée à l'alimentation quotidienne — planifier, faire les courses, suivre ses apports — tout en se faisant plaisir et en limitant les surprises (gaspillage, oublis, écarts non anticipés). Cet objectif n'est pas une intention vague : c'est le critère de recevabilité de toute fonctionnalité future. Une fonctionnalité qui ajoute de la charge de saisie sans réduire une charge équivalente ailleurs ne doit pas être acceptée telle quelle.

---

## 2. Principes directeurs (non-négociables)

Ces principes ont émergé au fil des décisions et doivent guider toute extension future du système, y compris au-delà de la V1.

1. **Confirmation par défaut, signalement de l'écart uniquement.** Un repas planifié est considéré mangé tel que prévu sans action de l'utilisateur. L'utilisateur n'intervient que pour signaler un écart (repas différent, repas sauté, journée entière hors-plan). On ne demande jamais une validation positive systématique.
2. **Précision approximative assumée plutôt que précision parfaite irréaliste.** Vrai pour la nutrition (les bases de données ont des marges d'erreur naturelles), vrai pour la péremption (dépend du stockage réel, jamais exact), vrai pour le stock (la cuisine réelle ne suit pas les grammages au gramme près). Viser l'exactitude sur ces points serait un gouffre de temps pour un gain illusoire.
3. **L'IA n'invente jamais une donnée vérifiable.** Le calcul nutritionnel ne doit jamais être délégué à un modèle de langage — celui-ci génère un nombre statistiquement plausible, pas un fait vérifié. L'IA peut interpréter, structurer, faire correspondre une saisie en langage naturel à une entrée réelle de la base de données, mais le chiffre final vient toujours de cette base, jamais d'une génération.
4. **Le backend est construit en fonctions réutilisables, pas en logique éparpillée dans l'interface**, dès la Phase 0 (ex. "ajouter un repas", "décrémenter le stock"). Condition nécessaire pour que l'assistant IA agentique futur appelle exactement les mêmes opérations que l'interface humaine, sans refonte.
5. **Tout fournisseur externe (IA, données nutritionnelles) est isolé dans une couche d'abstraction dédiée du code.** Un changement de fournisseur plus tard (ex. Groq vers un autre service) doit rester un ajustement mineur, jamais une réécriture.
6. **Aucune fonctionnalité ne doit dépendre d'un appareil personnel devant rester allumé en permanence**, si cette fonctionnalité est censée être accessible n'importe où, n'importe quand.
7. **Toute extension de périmètre doit être nommée et chiffrée explicitement**, jamais absorbée silencieusement dans l'estimation existante (voir section 13, historique des révisions).
8. **Toute donnée appelée à s'enrichir progressivement est stockée dans une structure extensible (table de référence + table de valeurs), jamais en colonnes fixes codées en dur.** Exemple concret : les types de nutriments suivis, pour permettre une personnalisation future par profil sans modification de schéma.

---

## 3. Périmètre fonctionnel détaillé (V1)

### 3.1 Planification de repas
- Calendrier de planification (jour/semaine).
- Un repas planifié est rattaché au **Foyer par défaut** (repas partagé, cuisiné et mangé ensemble), avec option de le marquer **individuel** pour les cas où une personne mange séparément.
- Association à une recette existante, ou saisie libre d'un repas hors-recette.
- Duplication/réutilisation d'une semaine passée comme point de départ, pour éviter de repartir d'une feuille blanche chaque semaine.
- Mode "journée entière hors-plan" en un geste, pour signaler un écart global sans validation repas par repas.
- Gestion des restes : un repas peut être marqué comme produisant un reste, réassignable à un créneau futur sans nouvelle recette ni nouveau besoin de courses.

### 3.2 Recettes
- Création et édition manuelle : ingrédients structurés avec quantités, étapes de préparation, temps de préparation et de cuisson.
- Calcul nutritionnel automatique dérivé des ingrédients (jamais saisi manuellement, jamais généré par IA).
- Ajustement des portions (scaling proportionnel).
- Tags et filtres (type de plat, régime, temps de préparation).
- Génération assistée par IA en phase ultérieure (voir section 9).

### 3.3 Suivi nutritionnel
- Double suivi distinct : **repas planifié** et **consommation réellement enregistrée**, liés mais indépendants.
- Un repas partagé porte une **quantité totale préparée** (qui décrémente le Stock). Chaque participant a sa propre **consommation réelle avec sa propre quantité consommée** (qui détermine ses macros individuelles) — ceci permet de représenter correctement le cas où deux personnes mangent des quantités différentes du même plat.
- Agrégation quotidienne et hebdomadaire, par profil individuel.
- Comparaison à des objectifs nutritionnels personnels (calories, macronutriments en priorité).
- Suivi micronutriments sur une **liste de base volontairement restreinte : fer, calcium, vitamine D, vitamine B12, fibres, sucres, sodium** — ciblant les carences les plus fréquentes en alimentation occidentale standard et les nutriments déjà couverts par la déclaration nutritionnelle obligatoire européenne, plutôt qu'une fausse exhaustivité sur l'ensemble des micronutriments existants. **Personnalisable par profil en phase ultérieure** : chaque personne pourra activer le suivi de nutriments additionnels selon ses besoins propres, sans modification de schéma — rendu possible par une structure de stockage extensible (principe directeur n°8), jamais des colonnes fixes.

### 3.4 Gestion de stock
- Suivi en **quantité précise** pour les denrées coûteuses ou peu fréquemment rachetées.
- Suivi en **simple présence/absence** pour les produits courants à faible enjeu (compromis nécessaire : une précision totale du stock est irréaliste, la cuisine réelle ne suit pas les grammages exacts).
- Décrémenté par la **consommation réelle**, jamais par le planning seul (sinon le stock se dérègle dès qu'un plan change).
- **Date d'ouverture déduite automatiquement** à la première consommation partielle enregistrée sur un article — zéro saisie additionnelle de la part de l'utilisateur.
- Rattaché au **Foyer** (le placard/frigo est physiquement commun).

### 3.5 Liste de courses
- Générée **dynamiquement**, pas stockée en dur : besoins des repas à venir, moins le stock disponible.
- Catégorisation par rayon de magasin.
- Suivi des articles cochés/achetés.
- Gestion d'une **liste récurrente** pour les produits de base indépendants du plan de repas (ex. café, lait).
- Ajout manuel d'articles hors-recette.

### 3.6 Partage familial (Foyer)
- Entité **Foyer** regroupant plusieurs **Profils**.
- Mécanique d'**invitation réelle** (email + acceptation), pas seulement un champ technique en base.
- Données partagées au niveau du Foyer : Stock, Liste de courses, Repas planifiés par défaut.
- Données strictement individuelles : objectifs nutritionnels personnels, Consommation réelle.
- **Visibilité des données nutritionnelles entre membres du foyer : privé par défaut, partage volontaire.** Chaque profil contrôle l'accès de ses propres données de consommation et d'objectifs aux autres membres du foyer ; rien n'est exposé sans action explicite. Choix retenu par cohérence avec les bonnes pratiques de gestion de données de santé personnelles, à coût d'implémentation minime.
- Gestion des accès concurrents sur les données partagées (Stock, Liste de courses) via les politiques de sécurité au niveau ligne de Supabase (Row Level Security), pour éviter qu'une modification simultanée par deux personnes ne corrompe silencieusement les chiffres.

---

## 4. Modèle de données complet

| Entité | Rôle | Rattachement |
|---|---|---|
| **Foyer** | Regroupe les profils, porte le Stock et la Liste de courses | — |
| **Profil** | Objectifs nutritionnels personnels | Foyer |
| **Recette** | Ingrédients structurés, étapes, temps de préparation/cuisson | — |
| **RepasPlanifié** | Date, créneau, recette ou libre, quantité totale préparée | Foyer (par défaut) ou Profil (si marqué individuel) |
| **ConsommationRéelle** | Quantité réellement consommée par une personne, statut conforme/différent/sauté | RepasPlanifié + Profil |
| **Stock** | Ingrédient, quantité précise ou présence/absence, `date_ouverture` nullable | Foyer |
| **TypeNutriment** | Référentiel extensible des nutriments suivables (nom, unité, catégorie macro/micro) | — |
| **ValeurNutritionnelle** | Valeur d'un nutriment donné pour un ingrédient/aliment donné | Ingrédient/Aliment + TypeNutriment |
| **ProfilNutrimentSuivi** | Sélection des nutriments suivis activement par un profil, au-delà de la liste de base | Profil + TypeNutriment |
| **RegleConservation** *(réservée, non livrée en V1)* | Catégorie d'aliment, durée non-ouvert, durée après ouverture | — |
| **ListeCourses** | Calculée dynamiquement, jamais stockée en dur | Foyer |
| **ConversationIA** *(réservée, non livrée en V1)* | Historique des échanges avec l'assistant, stocké côté serveur | Profil |

---

## 5. Architecture technique

| Composant | Choix retenu | Justification |
|---|---|---|
| Frontend | **PWA en React/Next.js** | Une seule base de code, fonctionne identiquement sur mobile et PC ; écosystème le mieux documenté pour un développeur solo |
| Backend | **Supabase (PostgreSQL)** | Authentification, synchronisation temps réel, Row Level Security et stockage fichier inclus ; palier gratuit largement suffisant à l'usage familial prévu |
| Hébergement frontend | **Vercel ou Netlify** | Gratuit, HTTPS systématique par défaut |
| Données nutritionnelles — ingrédients bruts | **USDA FoodData Central (API gratuite)** | Couverture macro et micronutriments nettement supérieure à Open Food Facts pour les aliments non emballés (légumes, fruits, viande, poisson), qui constituent l'essentiel des ingrédients de recette |
| Données nutritionnelles — produits emballés | **Open Food Facts (API gratuite)** | Bonne couverture des produits de marque en Europe, alimentée par scan de code-barres ; migration vers une API payante envisageable plus tard si la précision s'avère insuffisante en usage réel |
| Données de conservation/péremption | **USDA FoodKeeper comme point de départ**, adapté en table de référence par catégorie d'aliment | Aucune API ouverte unique ne combine nutrition, péremption non-ouvert et après-ouverture ; travail de curation borné mais réel |
| IA (génération de recettes, assistant conversationnel et agentique) | **API cloud à palier gratuit (Groq ou Gemini)**, pas d'hébergement local | Voir section 8 pour le raisonnement complet |
| Authentification | **Supabase Auth** | Standard de l'industrie, audité ; pas de développement sur mesure |
| Sécurité en transit | **HTTPS/TLS systématique** | Par défaut sur Supabase/Vercel/Netlify, aucune configuration requise |
| Distribution | **Aucune publication sur App Store / Play Store nécessaire** | Usage personnel/familial uniquement ; évite les frais de compte développeur, le processus de review, et la maintenance de certificats |

---

## 6. Stockage : ce qui va où

Point de clarification important, car plusieurs quotas distincts sont en jeu et ne doivent pas être confondus.

- **Base de données Supabase (500 Mo au palier gratuit)** : concerne les données structurées — recettes, plannings, stock, profils, historique de conversation IA (texte uniquement, quelques Ko par échange, négligeable). Largement suffisant à l'échelle d'un usage familial.
- **Assets visuels de l'interface** (icônes, illustrations, charte graphique) : ne consomment **pas** ce quota. Ils sont livrés avec le code de l'application, hébergés sur la plateforme qui sert la PWA (Vercel/Netlify). Quelques Mo au total, négligeable.
- **Photos éventuelles uploadées par les utilisateurs** (si cette fonctionnalité est ajoutée un jour) : relèveraient du stockage fichier Supabase, 1 Go gratuit, quota séparé de la base de données.
- **Modèle d'IA lui-même** (le LLM) : fichier de plusieurs Go, ne rentre dans aucun quota Supabase. Supabase est une base de données, pas un serveur de calcul ; il n'est pas fait pour exécuter de l'inférence IA. C'est précisément pour cette raison qu'un hébergement cloud à part (Groq/Gemini) est nécessaire pour l'IA, indépendamment de Supabase.

---

## 7. Sécurité

- **Authentification** : gérée nativement par Supabase Auth (hashage sécurisé des mots de passe, jetons de session, vérification email, authentification à deux facteurs possible plus tard). Aucun développement sur mesure.
- **Chiffrement en transit** : HTTPS/TLS systématique sur toute communication avec Supabase et l'hébergement frontend, déjà acquis par défaut sur ces plateformes.
- **Chiffrement de bout en bout : explicitement exclu.** Ce niveau rendrait les données illisibles même pour le serveur lui-même, ce qui serait incompatible avec l'assistant IA contextuel souhaité (qui a besoin de lire les données en clair pour répondre). Ni nécessaire ni souhaitable dans ce projet.
- **Accès concurrents sur données partagées** : géré via Row Level Security de Supabase, à configurer et tester sérieusement en Phase 0, pas une simple case à cocher.

---

## 8. Raisonnement complet sur l'hébergement de l'IA

Ce point a fait l'objet d'un débat substantiel et mérite d'être tracé intégralement, car la décision finale contredit une intuition initiale.

**Demande initiale** : IA open-source locale (Ollama), motivée par la maîtrise des coûts, envisagée notamment pour la génération de recettes.

**Contrainte révélée en cours de discussion** : rendre Ollama accessible depuis le mobile en déplacement exige que la machine hôte (PC personnel) reste allumée et connectée en permanence, avec une configuration d'accès distant sécurisé (VPN type Tailscale recommandé ; ouvrir directement des ports sur la box internet serait une faute de sécurité). Cela introduit une dépendance totale du service à la stabilité du matériel personnel et de la connexion internet domestique : une mise à jour Windows qui redémarre le PC, ou une coupure internet, fait tomber la fonctionnalité IA pour tout le foyer, y compris pour un membre du foyer en déplacement.

**Compromis envisagé puis écarté** : un petit serveur dédié toujours allumé (mini-PC, Raspberry Pi). Écarté parce qu'il ne supprime pas la contrainte, il la déplace simplement vers un nouvel appareil à acheter, configurer et maintenir — ajoutant de la charge opérationnelle exactement là où l'objectif est d'en retirer.

**Clarification du besoin réel** : l'objectif initial était la maîtrise des coûts, pas le caractère open-source en tant que tel. Une API cloud à palier gratuit (Groq, qui héberge d'ailleurs des modèles ouverts type Llama, ou Gemini) atteint le même objectif de coût nul aux volumes d'un usage familial, sans aucune des contraintes d'infrastructure ci-dessus.

**Risque résiduel assumé** : les conditions d'un palier gratuit chez un fournisseur cloud peuvent évoluer dans le temps, ce n'est pas une garantie contractuelle éternelle. Mitigation actée : isoler l'appel au modèle IA dans une couche dédiée du code (principe directeur n°5), pour qu'un changement de fournisseur reste un ajustement mineur.

**Décision finale, verrouillée** : API cloud à palier gratuit pour l'ensemble de la fonction IA (génération de recettes, assistant conversationnel, futur assistant agentique), pas d'hébergement local. Cette décision s'applique à l'IA dans son ensemble, et remplace l'intention initiale d'Ollama local même pour la seule génération de recettes, par cohérence — maintenir deux modes d'accès IA différents (l'un local, l'autre cloud) ajouterait de la complexité sans bénéfice clair.

---

## 9. Fonctionnalités différées (architecture préparée, livraison ultérieure)

- **Estimation de péremption et conservation après ouverture** : champs réservés dès la Phase 0 (`date_ouverture` sur Stock, table `RegleConservation`). Suggestions anti-gaspillage basées sur un tri déterministe simple par péremption croissante — aucune IA nécessaire pour cette logique.
- **Personnalisation du suivi micronutriments par profil** (ajout de nutriments au-delà de la liste de base) : schéma déjà préparé pour cet ajout sans refonte (voir section 3.3 et principe directeur n°8).
- **Génération de recettes assistée par IA** (cloud, voir section 8).
- **Assistant conversationnel IA en lecture seule**, avec accès au contexte : repas de la semaine, stock, macros. Aucune modification de schéma nécessaire grâce à des données structurées (principe directeur n°4).
- **Assistant IA agentique** (capacité d'action sur les données), envisagé seulement après validation de la fiabilité en lecture seule.

---

## 10. Décisions explicitement écartées (et pourquoi)

Pour éviter de relitiger ces points plus tard :

- **Calcul nutritionnel par IA** : écarté. Un modèle de langage génère un nombre plausible, pas vérifié — incompatible avec une fonctionnalité dont la fiabilité est la promesse centrale du projet.
- **Construction d'une base de données nutritionnelle propre** : écarté. Travail de plusieurs années-personnes pour un résultat qui ne serait pas plus fiable que les bases existantes.
- **Applications natives séparées (iOS + Android + Windows/Mac dédiés)** : écarté pour un développeur solo sur un projet personnel. Aucune fonctionnalité demandée n'exige réellement les capacités exclusives du natif pur ; le rapport effort/bénéfice est mauvais.
- **Hébergement local de l'IA (Ollama sur PC ou mini-serveur personnel)** : écarté, voir raisonnement complet section 8.
- **Chiffrement de bout en bout** : écarté, incompatible avec l'assistant IA contextuel souhaité.
- **Publication sur les stores d'applications** : non nécessaire, usage personnel/familial uniquement.

---

## 11. Décisions encore ouvertes

Aucune à ce stade. Les deux points qui figuraient ici (liste des micronutriments suivis, règles de visibilité entre membres du foyer) ont été tranchés — voir sections 3.3 et 3.6 respectivement. Cette section est conservée dans la numérotation pour accueillir toute future décision en suspens, conformément au principe directeur n°7.

---

## 12. Frictions anticipées et mitigations de conception

Identifiées par simulation d'usage quotidien et hebdomadaire :

- **Écarts de journée entière** (repas pris à l'extérieur, invitation) : mitigé par le mode "journée hors-plan" en un geste (section 3.1).
- **Dérive du stock réel vs enregistré** : friction physique intrinsèque (la cuisine réelle ne suit pas les grammages exacts), pas un défaut corrigible par le design. Mitigé par la distinction quantité précise / présence simple selon le type d'aliment (section 3.4). Ce risque reste présent même avec cette mitigation — à surveiller en usage réel.
- **Fatigue de planification hebdomadaire répétée** : mitigée par la duplication/réutilisation de semaines passées.
- **Réconciliation courses réelles vs liste prévue** (rupture de stock, achat d'opportunité) : non totalement résolue à ce stade, à surveiller à l'usage — un mécanisme de réconciliation pourrait s'avérer nécessaire en Phase 2 ou 3.
- **Restes non modélisés initialement** : intégré comme fonctionnalité de base (section 3.1), pas différé.
- **Élargissement progressif du périmètre** : voir section 13.

---

## 13. Historique des révisions du périmètre

Transparence sur l'évolution du projet, pour mémoire :

| Étape | Périmètre | Estimation Phases 0-2 |
|---|---|---|
| Initiale | Planification + courses + nutrition planifiée + recettes, sans stock ni multi-utilisateur | 6 à 10 semaines |
| + Consommation réelle + gestion de stock dès la V1 | Ajout d'un sous-système de stock complet et d'une double entité planifié/réel | 10 à 16 semaines |
| + Partage familial réel dès la V1 | Ajout d'une entité Foyer, invitation réelle, règles de visibilité, gestion d'accès concurrents | **14 à 22 semaines** (estimation actuelle) |

Toute nouvelle extension de périmètre doit être ajoutée à ce tableau avec sa propre révision d'estimation, conformément au principe directeur n°7.

---

## 14. Séquencement des phases

| Phase | Contenu |
|---|---|
| 0 | Schéma complet (y compris champs réservés), authentification + Row Level Security, intégration Open Food Facts, recettes manuelles, backend en fonctions réutilisables |
| 1 | Planification de repas + nutrition planifiée/réelle par profil |
| 2 | Stock + liste de courses + partage Foyer opérationnel (invitation, visibilité, accès concurrents) |
| 3 | Péremption/conservation + suggestions anti-gaspillage |
| 4 | Génération de recettes par IA |
| 5 | Assistant conversationnel IA (lecture seule) |
| 6 | Assistant IA agentique (lecture/écriture) |

**Estimation actuelle, Phases 0 à 2 cumulées : 14 à 22 semaines à 10-20h/semaine.** Les phases 3 à 6 ne sont pas chiffrées : un horizon aussi lointain rendrait toute estimation actuelle artificielle.
