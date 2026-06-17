# Courses / Liste de courses — éléments de retravail

Fichier de suivi des tests de la section **Courses**. Recense les bugs potentiels et les fonctionnalités à **modifier / supprimer / améliorer** lors de la phase de retravail.

- **Source testée** : `src/lib/core/shopping.ts` (`generateShoppingList`), `src/app/(app)/courses/page.tsx`, `src/app/(app)/courses/actions.ts`
- **Contexte** : liste recalculée dynamiquement (specs §3.5), fenêtre 2 semaines (aujourd'hui → J+13) = besoins repas − stock + récurrents + manuels.
- **Foyer de test** : « Maison » (compte SAWADA)
- **Démarré le** : 2026-06-17

## Légende sévérité
- 🔴 **Bug** : comportement incorrect / contraire aux specs
- 🟠 **À améliorer** : fonctionne mais UX/robustesse perfectible
- 🟡 **À discuter** : choix de conception à trancher
- 🟢 **OK** : conforme, aucun retravail nécessaire

---

## Suivi des tests

| # | Test | Statut | Verdict |
|---|---|---|---|
| 1 | Cas de base (recette liée `food_id`) | ✅ fait | 🟢 OK (+ 🟡 observation) |
| 2 | Déduction stock — quantité | ✅ fait | 🟢 base OK / 🔴 bug unités |
| 3 | Déduction stock — présence | ✅ fait | 🟢 OK |
| 4 | Multiplicité (recette ×3 jours) | ✅ fait | 🟢 OK |
| 5 | Journée hors-plan | ✅ fait | 🟢 OK |
| 6 | Bornes fenêtre J+13 / J+14 | ✅ fait | 🟢 OK |
| 7 | Recette IA / libellé + normalisation | ✅ fait | 🟢 OK |
| 8 | Correspondance d'unités (libellé) | ✅ fait | 🟢 base OK / 🟠 sous-achat si unité ≠ |
| 9 | Récurrents (cycle de vie) | ✅ fait | 🟢 OK (+ 🟠 collision de clés à confirmer) |
| 10 | Manuel + persistance du coché | ✅ fait | 🟢 OK / 🟠 cochés jamais réinitialisés |

---

## Constats détaillés

### Test 1 — Cas de base (recette à ingrédients liés `food_id`)
**Setup** : recette `ZZTEST Gâteau` (Farine 200 g, Beurre 100 g, Sucre 50 g, tous `food_id`) planifiée le 2026-06-19 (dans la fenêtre, jour non hors-plan).
**Résultat** : ✅ « Repas à venir » affiche `TESTFARINE · 200 g`, `TESTBEURRE · 100 g`, `TESTSUCRE · 50 g`. Quantités exactes, bonne section.
**Verdict** : 🟢 Conforme.

**🟡 Observation à discuter (pas un bug)** : les besoins « précis » ne s'affichent que si les ingrédients de recette portent un `food_id`. Or **toutes les recettes existantes du foyer (et celles générées par IA) ont des ingrédients en `free_text` uniquement** — la table `food` est vide et aucun écran ne permet de lier un ingrédient à un aliment. En usage réel, la branche précise (`needByFood`) n'est donc quasiment **jamais déclenchée** ; tout passe par la branche libellé (`needByLabel`), plus fragile (cf. tests 7-8). À trancher au retravail : faut-il un parcours de liaison ingrédient→aliment, ou assumer le tout-libellé ?

### Test 2 — Déduction du stock (mode quantité)
**Setup** : besoin TESTFARINE 200 g ; stock TESTFARINE (food_id, mode quantité).
**Résultats** :
- Stock 50 g → ligne `TESTFARINE · 150 g` (200 − 50) ✅
- Stock 200 g → ligne **disparaît** (reste 0) ✅
- Stock **1 kg** → ligne `TESTFARINE · 199 g` ❌

**🔴 BUG — la déduction par `food_id` ignore totalement l'unité** (`shopping.ts` lignes 136-143). Elle fait `besoin.qty − stock.qty` brut : 200 g − 1 (kg) = 199, et réaffiche « 199 g ». Conséquences :
- un stock « 1 kg » censé couvrir 200 g ne couvre rien (reste 199 g) ;
- inversement un stock « 500 g » contre un besoin « 0,5 kg » soustrairait 500 de 0,5.
- Asymétrie : la branche **libellé** (`needByLabel`, lignes 153-157) vérifie `sameUnit` ; la branche **food_id**, non.

**Pistes de retravail** :
1. a minima, ne soustraire que si les unités correspondent (symétrie avec la branche libellé) ;
2. mieux : table de conversion d'unités (g↔kg, ml↔cl↔L) — cohérent avec le principe « précision approximative assumée », mais au moins corriger les conversions évidentes de même dimension ;
3. exploiter `food.default_unit` / `base_amount` pour normaliser les quantités.

### Test 3 — Déduction du stock (mode présence)
**Setup** : besoin TESTBEURRE 100 g ; stock TESTBEURRE (food_id, mode présence, présent).
**Résultat** : ✅ la ligne **disparaît entièrement**, indépendamment de la quantité requise. Conforme au principe « précision approximative assumée » (en présence, on suppose qu'on en a assez).
**Verdict** : 🟢 Conforme.

### Test 4 — Multiplicité (même recette plusieurs jours)
**Setup** : `ZZTEST Gâteau` planifiée 3 jours (19, 22, 23 juin).
**Résultat** : ✅ quantités cumulées ×3 — Farine 600 g, Beurre 300 g, Sucre 150 g.
**Verdict** : 🟢 Conforme.

**🟡 Note de conception** : le cumul se fait par **nombre d'occurrences du repas**, sans tenir compte de `servings` ni du nombre de convives (`is_individual`, `individual_profile_id`, `total_quantity_prepared` ignorés). Modèle implicite : « 1 repas planifié = 1 fournée de la recette telle que définie ». Acceptable, mais à documenter / trancher si un jour on veut adapter aux portions réelles.

### Test 5 — Journée hors-plan
**Setup** : `ZZTEST Gâteau` planifiée 19/22/23 juin ; le 23/06 marqué hors-plan (scope foyer).
**Résultat** : ✅ quantités passées de ×3 à ×2 (Farine 400 g, Beurre 200 g, Sucre 100 g) — le repas du 23 est exclu.
**Verdict** : 🟢 Conforme.

**🟡 Note** : seul le scope `household` exclut les besoins (`shopping.ts` ligne 48). Un hors-plan **individuel** (`scope='individual'`) ne réduit pas la liste — cohérent car la liste est au niveau foyer, mais à garder en tête.

### Test 6 — Bornes de la fenêtre (J+13 / J+14)
**Setup** : `ZZTEST Gâteau` planifiée le 2026-06-30 (J+13) et 2026-07-01 (J+14). Aujourd'hui = 2026-06-17.
**Résultat** : ✅ seul le 30/06 contribue (besoins ×1) ; le 01/07 est exclu. Fenêtre = aujourd'hui → J+13 inclus (14 jours).
**Verdict** : 🟢 Conforme.

**🟡 Note mineure** : la fenêtre s'appuie sur `new Date()` côté serveur (heure locale machine). Près de minuit ou en fuseau différent, la borne peut glisser d'un jour. Sans gravité pour l'usage.

### Test 7 — Recette IA / libellé + normalisation
**Setup** : recette free_text avec « Échalote » (2 pièce), « echalotes » (3 pièce), « Persil frais » (1 botte), planifiée le 19/06.
**Résultat** : ✅ fusion en `Échalote · 5 pièce` (accents/casse/pluriel neutralisés par `normalizeLabel`), libellé d'affichage = première graphie. Persil séparé.
**Verdict** : 🟢 Conforme. Élucide aussi le « Oeufs · 2 pièce » (= 8 requis − 6 stock, normalisation pièce/pièces OK).

**🟡 Risque de sur-fusion (faible)** : `normalizeLabel` retire le `s` final et tous les accents → deux aliments distincts au même radical fusionneraient (ex. « pâte » et « pâtes »). Rare, acceptable au regard du principe « précision approximative », mais à garder en tête.

### Test 8 — Correspondance d'unités (besoin par libellé)
**Setup** : besoin free_text « RizTest 100 g » ; stock libellé « RizTest » présent.
**Résultats** :
- stock 100 **ml** (unité ≠) → l'article **disparaît** de la liste ❌
- stock 60 **g** (unité =) → `RizTest · 40 g` (100 − 60) ✅

**🟠 BUG / risque de sous-achat — unité ≠ + libellé présent ⇒ article supprimé** (`shopping.ts` lignes 153-154). Quand l'unité du stock ne correspond pas à celle du besoin, le code fait `continue` et **traite l'article comme couvert** : on a 100 ml mais on a besoin de 100 g (dimension différente) → l'app décide qu'on n'a rien à acheter. Conséquence : on oublie d'acheter un ingrédient réellement manquant.
- Comportement « présence assumée » défendable pour un stock *en mode présence* (sans quantité), mais ici le stock a une **quantité chiffrée dans une autre unité** → l'hypothèse « couvert » est fausse.
- **Piste** : si unités incompatibles et stock quantitatif, **conserver le besoin entier** plutôt que de l'effacer (ne jamais faire disparaître un besoin sur une simple incompatibilité d'unité). Idéalement, conversion d'unités (cf. bug Test 2) pour comparer pour de vrai.

### Test 9 — Récurrents (cycle de vie)
**Setup** : produit récurrent TESTSUCRE (food_id, 1 paquet).
**Résultats** :
- Apparaît sous « Récurrents » (`TESTSUCRE · 1 paquet`) + dans le panneau de gestion ✅
- Mis en stock (présent) → disparaît des « Récurrents » mais reste configuré dans « Produits récurrents » ✅
- Bouton « supprimer » (UI) → retiré de la config (« Aucun produit récurrent ») ✅
**Verdict** : 🟢 Conforme.

**🟠 Collision de clés d'état coché (repéré par lecture du code, à confirmer)** : la clé d'état d'un récurrent lié à un aliment est `food:<id>` (`shopping.ts` l.225) — **identique** à celle d'un besoin de recette pour le même aliment (l.198). Donc si un aliment est à la fois besoin de recette **et** récurrent :
- il apparaît en **double** (une ligne « Repas à venir » + une ligne « Récurrents »), et
- cocher l'un coche l'autre après rechargement (même `item_key` dans `shopping_item_state`).
De plus, les récurrents par libellé utilisent `label:<label>` **brut, non normalisé**, alors que les besoins par libellé utilisent `recipe-label:<normalisé>` → schéma de clés incohérent. À unifier au retravail.

### Test 10 — Ajout manuel + persistance du coché
**Setup** : ajout manuel « ZZTESTmanuel · 2 u » (via UI) ; coché du manuel ET d'une ligne « Repas à venir » (Oeufs) ; rechargement.
**Résultat** : ✅ après reload, persistance confirmée en base — `shopping_manual_item.checked=true` et `shopping_item_state['recipe-label:oeuf']=true`. Ajout + coché + suppression fonctionnent.
**Verdict** : 🟢 Conforme sur la persistance.

**🟠 Cochés jamais réinitialisés (pas de fin de cycle de courses)** : `shopping_item_state` n'est jamais purgé et la lecture ne filtre pas sur le temps (`checked_at` existe mais inutilisé). Conséquences :
- une ligne cochée **reste cochée indéfiniment**, sur toutes les semaines suivantes ; un besoin récurrent réapparaissant la semaine d'après s'affiche déjà coché ;
- aucun bouton « courses terminées » / « réinitialiser » / « décocher tout ».
- **Piste** : action de fin de course qui décoche tout (ou purge `shopping_item_state` + remet `shopping_manual_item.checked=false`), ou réinitialisation auto au passage de semaine via `checked_at`.

---

## Synthèse — priorités de retravail

**Robustesse du calcul (le plus impactant)**
1. 🔴 **Unités ignorées dans la déduction `food_id`** (Test 2) — `200 g − 1 kg = 199 g`. Corriger la comparaison d'unités, idéalement avec conversion (g/kg, ml/cl/L).
2. 🟠 **Sous-achat sur unité ≠ (libellé présent)** (Test 8) — un besoin disparaît si l'unité du stock diffère. Ne jamais effacer un besoin sur simple incompatibilité d'unité.
3. 🟠 **Schéma de clés d'état incohérent + collision** (Test 9) — `food:<id>` partagé entre recette et récurrent (doublon + coché lié) ; libellés tantôt normalisés tantôt bruts. Unifier.

**UX / cycle de vie**
4. 🟠 **Cochés jamais réinitialisés** (Test 10) — prévoir une fin de cycle de courses.

**Conception à trancher**
5. 🟡 **Tout-libellé en pratique** (Test 1) — aucun ingrédient n'est lié à un `food_id` réel (table `food` vide, pas d'UI de liaison). La branche précise est inerte ; tout repose sur le fragile matching par libellé.
6. 🟡 Cumul par occurrences sans `servings`/convives (Test 4) ; hors-plan individuel ignoré (Test 5) ; fenêtre selon l'horloge serveur (Test 6) — à documenter.

**Conforme, aucun retravail**
- Génération des besoins, déduction stock même unité, mode présence, multiplicité, exclusion hors-plan foyer, bornes fenêtre, normalisation/fusion des libellés, cycle de vie des récurrents, persistance du coché.

---

## Retravail effectué — 2026-06-17

Modifs dans `src/lib/core/shopping.ts` (corrections de bugs uniquement, périmètre inchangé). `tsc --noEmit` OK.

- ✅ **#1 — Unités dans la déduction `food_id`** : ajout d'un module de réconciliation d'unités (`UNIT_TO_BASE`, `toBase`/`fromBase`, `normalizeUnit`) regroupant par dimension (masse g, volume ml, comptage pièce). Le stock par aliment est agrégé en unité de base (`stockBaseByFood` + `addStockBase`), la déduction passe par `remainingAfterStock`.
  - Vérifié : besoin 200 g / stock **1 kg** → ligne disparaît ; stock **0,15 kg** → reste **50 g**.
- ✅ **#2 — Plus de sous-achat sur unité ≠** : `remainingAfterStock` renvoie le **besoin entier** si les unités sont incompatibles (dimensions différentes) ou non convertibles, au lieu de masquer l'article. La branche libellé n'utilise plus `sameUnit` (supprimé).
  - Vérifié : besoin 100 g / stock **100 ml** → `RizTest · 100 g` reste affiché.
- ✅ **#3 — Clés d'état désambiguïsées** : les récurrents utilisent désormais `recurring-food:<id>` / `recurring-label:<normalisé>` (au lieu de `food:<id>` partagé avec les recettes, et `label:<brut>`). Plus de collision de coché ni de schéma incohérent. (Correction au niveau code ; `shopping_item_state` était vide.)
- ✅ Au passage : suppression d'une ligne de normalisation redondante et d'un risque d'encodage (caractères combinants littéraux) dans le helper d'unités.

**Reportés (hors « correction de bug » — à valider avant implémentation, cf. règle du projet)** :
- 🟡 **#5 Parcours de liaison ingrédient→aliment** et **#6** (servings/convives, hors-plan individuel, fuseau) = décisions de conception.

### #4 — Réinitialisation des cochés ✅ implémenté (Option 3, validée par l'utilisateur)
Fonctionnalité ajoutée après validation (choix Option 3 — section repliable).
- `src/app/(app)/courses/actions.ts` : nouvelle action `clearCheckedAction` (supprime `shopping_item_state` du foyer + remet `shopping_manual_item.checked=false`). Ne supprime aucune ligne.
- `src/app/(app)/courses/page.tsx` : les lignes sont scindées en **actives** (par source) et **cochées** ; ces dernières vont dans une section repliable **« Déjà pris (N) »** (`<details>`, sans JS client) avec un bouton **« Tout décocher »**. Les articles manuels gardent leur bouton « supprimer » dans cette section.
- Vérifié en direct : coché → bascule en « Déjà pris » ; « Tout décocher » → tout revient en actif et la section disparaît. `tsc` + `eslint` OK.
