# Courses / Liste de courses — Refonte UX (document de référence)

> Document vivant. Sert de **référence unique** pour la refonte de la section Courses :
> problèmes UX à régler, étude de marché, et feuille de route des tâches.
> Mis à jour au fil de l'avancement. Démarré le 2026-06-17.

Fichiers liés :
- Code : `src/lib/core/shopping.ts`, `src/app/(app)/courses/page.tsx`, `src/app/(app)/courses/actions.ts`, `src/lib/units.ts`
- Tests & corrections déjà faites : [courses-retravail-findings.md](./courses-retravail-findings.md)
- Brief design (à transmettre à Claude Design) : [claude-design-courses-brief.md](./claude-design-courses-brief.md)

---

## 1. Objet & philosophie

Rendre la section **réellement utile**, pas seulement « fonctionnelle ». Le fil conducteur :
**comprendre le job réel de l'utilisateur** (« faire les courses ») plutôt que d'exposer la
plomberie du système. Toute décision se mesure à : *est-ce que ça réduit la charge mentale et
le risque d'erreur d'un humain qui prépare, fait, puis range ses courses ?*

### Racine du problème actuel
L'écran est organisé **autour des sources de données** (Repas à venir / Récurrents / Ajouts
manuels) et non autour de la **tâche**. On montre d'où vient chaque ligne au lieu d'aider à
acheter. C'est la cause de la majorité des frictions.

### Le cycle réel (que le produit doit raconter)
```
1. DÉCIDER  quand je fais les courses (jour fixe, hebdo, bi-hebdo, plusieurs fois/sem.)
2. PRÉPARER la liste (auto depuis repas + récurrents + ajouts ; dédoublonnée ; sans surplus)
3. ACHETER  (lecture facile en magasin : tri par rayon, cocher au fur et à mesure)
4. RANGER   (les achats entrent au stock, datés → péremption ; identité produit conservée)
```
Aujourd'hui seule l'étape **2** est couverte (imparfaitement). 1, 3 et 4 sont absentes/implicites.

---

## 2. Inventaire complet des problèmes UX

Légende statut : ⏳ à faire · 🚧 en cours · ✅ fait · 💤 reporté

| ID | Problème | Chantier | Statut |
|---|---|---|---|
| UX-01 | Sections au jargon obscur (« récurrents » ? « ajout manuel » ? pourquoi « repas à venir » ici ?) ; utilisateur perdu à l'arrivée | A | ⏳ |
| UX-02 | Pas de **cadence** de courses configurable — fenêtre figée à 14 jours codée en dur | H | ⏳ |
| UX-03 | Saisie d'article **sans autocomplétion / suggestion** (taper « Riz » ne propose rien) | D | ⏳ |
| UX-04 | Pas de **formats/conditionnements courants** (riz 1 kg, 500 g) pour saisie en 1 clic | D | ⏳ |
| UX-05 | **Unité en texte libre** → ambiguïté « g » / « gramme » / « Gramme » | B | ⏳ |
| UX-06 | **Cycle de vie peu clair** : reconduction hebdo non expliquée ; articles manuels non datés ni scopés à une période | C (explication) + H | ⏳ |
| UX-07 | Pas de **flux Achat → Stock** : valider les courses ne fait que nettoyer les coches | E | ⏳ |
| UX-08 | **Identité produit absente** : articles en `free_text` → impossible de trier, rapprocher du stock, fiabiliser | D | ⏳ |
| UX-09 | **Date d'achat non capturée** → la péremption (Phase 3) n'est pas alimentée par les courses | E | ⏳ |
| UX-10 | **Liste longue illisible** (foyer nombreux) : pas de tri par rayon, pas de regroupement repliable/personnalisable | F | ⏳ |
| UX-11 | Pas d'**alerte anti-surplus** quand on ajoute un article déjà suffisamment en stock | G | ⏳ |
| UX-12 | Pas de **détection de doublon** à la saisie (article déjà dans la liste) | D/G | ⏳ |
| UX-13 | Pas d'**annulation (undo)** sur suppression/décochage accidentel (frustration n°1 du marché) | (transversal) | ⏳ |
| UX-14 | **Ergonomie en magasin** : lecture mobile, cocher au pouce, garder l'écran lisible d'une main | (transversal) | ⏳ |
| UX-15 | **Sync foyer** : mise à jour seulement à l'action (revalidation), pas de temps réel multi-appareils | (à évaluer) | ⏳ |

### Déjà traité (référence)
| ID | Sujet | Statut |
|---|---|---|
| FIX-1 | Déduction stock ignorait les unités (`200 g − 1 kg = 199 g`) → réconciliation par dimension | ✅ |
| FIX-2 | Besoin masqué sur unité incompatible (sous-achat) → besoin conservé | ✅ |
| FIX-3 | Collision de clés d'état récurrent/recette → clés préfixées | ✅ |
| FEAT-1 | Section repliable « Déjà pris » + « Tout décocher » (réinitialisation des coches) | ✅ |

---

## 3. Étude de marché — apps de listes de courses

Objectif : s'inspirer des standards éprouvés et **anticiper les limites** que ces apps n'ont
pas su résoudre, pour ne pas les reproduire.

### 3.1 Acteurs et points forts
- **Bring!** — partage foyer simple (enfants, peu technophiles), intégration assistants vocaux (Siri/Alexa/Google).
- **AnyList** — fort sur recette → liste ; **catégorisation auto** (Produce, Dairy, Deli…) **réordonnable selon le plan de TON magasin** ; meal planning. Free + Complete ~10–15 $/an.
- **OurGroceries** — **sync temps réel** la plus rapide entre membres du foyer (cocher = disparaît instantanément chez l'autre).
- **Listonic** — catégorisation intelligente, saisie vocale, **estimation du coût total** via historique.
- **Grocery AI / Any.do / « Grocery »** — **tri par rayon** + **inventaire/garde-manger** : items marqués « épuisés », réapprovisionnement auto, suivi des dates d'expiration, scan code-barres, import depuis ticket de caisse/photo.
- **FoodiePrep / Plan to Eat / Paprika / Mealime** — recette → liste avec **rapprochement garde-manger** (« pantry-aware ») : on ne rachète pas ce qu'on a déjà.

### 3.2 Fonctionnalités devenues des **standards attendus**
1. **Autocomplétion** sur un catalogue d'articles dès les 1ères lettres.
2. **Catégorisation automatique par rayon**, réordonnable selon le magasin de l'utilisateur.
3. **Cocher en magasin** fluide (l'item barré/disparaît), une main, gros tap.
4. **Partage foyer + sync temps réel**.
5. **Recette → liste** et **rapprochement garde-manger** (anti-doublon d'achat).
6. **Quantités + unités normalisées** (jamais en texte libre).
7. Optionnels : coût estimé, scan code-barres, saisie vocale, import ticket.

### 3.3 Limites récurrentes que MÊME les leaders ne règlent pas (pièges à éviter)
- **Friction de saisie** : une étude relève jusqu'à **34 taps** pour ajouter un ingrédient. → viser l'ajout en 1–2 gestes.
- **Pas d'undo** : suppression/décochage accidentels irrécupérables → **prévoir une annulation**.
- **Catégories qui « oublient »** les choix de l'utilisateur, re-tri manuel à chaque fois → **persister les associations article→rayon**.
- **Pas de signal de doublon** à l'ajout → items en double. → **détecter et fusionner**.
- **Sync défaillante** (listes pas à jour, items qui sautent de liste) → fiabilité du partage = critique.
- **Fonctions déconnectées** : recettes, planning, garde-manger, liste, magasin rarement bien reliés. → **l'intégration est notre avantage** (tout est déjà dans Mealing).
- **Subscription fatigue / pubs** : non concerné (usage perso/familial, pas de monétisation).

### 3.4 Notre angle différenciant
Mealing a déjà sous le même toit : **planning de repas + recettes + stock + péremption + foyer + IA**.
Les apps du marché échouent surtout sur **l'intégration** de ces briques. Notre valeur n'est pas
de refaire une n-ième liste, mais de **boucler le cycle** repas → liste → achat → stock → péremption,
ce que presque personne ne fait bien.

Sources : [Listonic vs AnyList](https://listonic.com/compare-apps/listonic-vs-anylist) ·
[7 Best Grocery List Apps 2026](https://groceriestracker.com/blog/best-grocery-list-apps-2026) ·
[SmartCart — comparatif](https://smartcartfamily.com/en/blog/grocery-apps-comparison) ·
[Avis utilisateurs (justuseapp)](https://justuseapp.com/en/app/331302745/listonic-grocery-shopping-list/reviews) ·
[« The perfect grocery list app still doesn't exist » (étude)](https://www.techbuzz.ai/articles/the-perfect-grocery-list-app-still-doesn-t-exist-study-finds) ·
[Grocery AI (tri rayon + inventaire)](https://apps.apple.com/us/app/grocery-ai/id1544118181) ·
[FoodiePrep — pantry-aware](https://www.foodieprep.ai/blog/meal-planning-apps-with-builtin-grocery-lists-a-2026-sidebyside-review)

---

## 4. Invariants Mealing à respecter (specs)

- **Confirmation par défaut** : l'auto reste l'option par défaut ; ne pas transformer la liste en formulaire à remplir.
- **Stock décrémenté par la consommation réelle uniquement** : l'achat est un **flux entrant** (ajout au stock), jamais un second chemin de décrément.
- **Précision approximative assumée** : conversions/formats/rayons « au mieux », sans viser l'exactitude parfaite.
- **Liste non stockée (dynamique)** : la reconduction est native → la **rendre visible**, pas la matérialiser en base.
- **L'IA n'invente pas de donnée vérifiable** : catégories/rayons et nutrition viennent de données, pas d'un LLM seul.
- **Données extensibles** : table de référence + valeurs (ex. rayons), pas de colonnes figées.

---

## 5. Feuille de route (ordre validé : A → B → C → D → E → H)

> Q2 validé : on **cadre puis propose** chaque chantier avant implémentation.
> F (tri par rayon) et G (anti-surplus) dépendent de D (catalogue) → traités dans sa foulée.

### Chantier A — Clarifier le modèle mental *(UX-01)* — quick win
Réorganiser autour de la tâche : libellés clairs, provenance discrète (pas 3 gros titres système),
micro-explications. Objectif : qu'un nouvel utilisateur comprenne l'écran en 5 secondes.
- **Statut** : ⏳ à cadrer (en premier)

### Chantier B — Unités normalisées *(UX-05)* — quick win
Remplacer le champ unité texte libre par une **liste déroulante** d'unités courantes (g, kg, ml,
cl, L, pièce, …). Alimente directement les conversions déjà codées (FIX-1).
- **Statut** : 🚧 fondation backend faite — `src/lib/units.ts` (source de vérité unique :
  `UNIT_OPTIONS` pour l'UI + `toBase`/`fromBase` pour le calcul ; `shopping.ts` refactoré pour la
  consommer). Reste : brancher le `<select>` dans le formulaire (avec le design).

### Chantier C — Expliquer le cycle *(UX-06 partiel)* — quick win
Phrase/affordance « cette liste se met à jour seule selon vos repas et votre stock » + clarifier
ce que devient un article. Lève le « et ensuite ? ».
- **Statut** : ⏳

### Chantier D — Catalogue d'aliments + autocomplétion *(UX-03, UX-04, UX-08 ; débloque F, G, E)*
Fondation : peupler/relier un catalogue (USDA/OFF déjà intégrés) + autocomplétion à la saisie +
formats courants + **identité produit stable** (lien `food_id`). Sans ça, le reste reste cosmétique.
- **Décisions validées** : D.1 hybride · D.2 seed FR de base · D.3 `food_id` sur les manuels ·
  D.4 table de conditionnements · D.5 périmètre Courses.
- **Statut** : 🚧 **backend fait** — migrations `0008_food_catalog` (schéma : `food.category`,
  table `food_package`, `shopping_manual_item.food_id` + index d'unicité catalogue) et
  `0009_seed_food_catalog` (76 aliments FR / 8 rayons / 29 conditionnements) appliquées ;
  types régénérés (`database.types.ts`) ; `core/foods.ts` : `searchFoodCatalog` (hybride local +
  fournisseurs), `importFoodByRef` (import paresseux). Vérifié sur données réelles.
- **Reste (avec le design)** : composant client d'autocomplétion (input débouncé → action →
  suggestions + formats + unité pré-remplie ; sélection externe → import). UI = écran #3 du brief.

### Chantier E — Flux Achat → Stock *(UX-07, UX-09)*
Valider les courses pousse les articles cochés dans le **stock**, **datés** (→ péremption Phase 3).
Dépend de D pour l'identité produit. C'est ce qui transforme « liste » en « outil ».
- **Statut** : ⏳

### Chantier H — Cadence de courses configurable *(UX-02)*
Remplacer la fenêtre figée 14 j par un réglage (hebdo / bi-hebdo / jour de courses).
- **Statut** : ⏳

### Dépendants de D (à planifier après) 
- **F — Tri par rayon** *(UX-10)* : regroupement par catégorie, sections repliables, ordre réordonnable selon le magasin (s'appuie sur `food_category` déjà présent dans `conservation_rule`).
- **G — Anti-surplus & anti-doublon** *(UX-11, UX-12)* : alerte si l'article ajouté est déjà en stock suffisant / déjà dans la liste.

### Transversaux (à intégrer chemin faisant)
- **UX-13 Undo** sur suppression/décochage.
- **UX-14 Ergonomie magasin** (lecture mobile, gros tap).
- **UX-15 Sync foyer** temps réel — à évaluer (coût/bénéfice vs revalidation actuelle).

---

## 6. Suivi des tâches

| Étape | Chantier | Cadrage | Implémentation |
|---|---|---|---|
| 1 | A — Modèle mental (liste unique + provenance) | ✅ | ✅ UI (maquette Claude Design) |
| 2 | B — Unités normalisées | ✅ | ✅ `UNIT_OPTIONS` + `<select>` |
| 3 | C — Explication du cycle | ✅ | ✅ sous-titre + état vide |
| 4 | D — Catalogue + autocomplétion | ✅ | ✅ back + composant client `add-article.tsx` |
| — | F — Tri par rayon (sections repliables) | ✅ | ✅ groupement `food.category` + icônes |
| — | Banque d'assets (icônes produits) | — | ✅ `src/lib/product-assets.tsx` |
| 5 | E — Achat → Stock daté | ✅ | ✅ checkout → stock (fusion + nettoyage), vérifié en direct |
| — | G — Anti-surplus / anti-doublon | ✅ | ✅ alerte à l'ajout (liste + stock), vérifié en direct |
| 6 | H — Cadence configurable | ✅ | ✅ horizon foyer (3/7/14 j), vérifié en direct |
| — | UX-13 Undo (suppression) | ✅ | ✅ toast « supprimé · Annuler » (manuels + essentiels) |
| — | Rayons : clé stable (fix dérive) + auto-lien catalogue + marqueur stock | ✅ | ✅ migration 0011 + `findCatalogFoodIdByLabel` + pastille « déjà en stock » |
| — | UX-14 mode magasin mobile | ✅ (maquette) | ✅ `/courses/magasin` (gros boutons, progression, CTA collant) |

_Mise à jour après chaque chantier._

### Implémentation maquettes Claude Design — 2026-06-18
Handoff importé dans `design/handoff-courses/` (zip → impossible via connecteur DesignSync, token sans scopes design). Sources : `Mealing - Courses (refonte).dc.html` (8 états), `Mealing - Banque d'assets.dc.html`, `produits-assets.js`.

- **Banque d'assets** → `src/lib/product-assets.tsx` : `PRODUCTS` (~45 pictos doodle), `CATEGORIES` (rayons), `PROVENANCE`, composants `ProductIcon` / `ProvenanceBadge`, `resolveProduct` (alias slugs catalogue → picto).
- **Courses (refonte)** : `page.tsx` réécrit — en-tête (titre + accent Caveat + sous-titre clair), **liste unique « À acheter » groupée par rayon** (sections repliables, icône + nom + puce de provenance + qté), « Déjà pris » + « Tout décocher », état vide, « Mes essentiels » (ex-récurrents). `add-article.tsx` (client) : autocomplétion (`searchCatalogAction`), formats 1 clic (`food_package`), unité (`<select>`). `shopping.ts` enrichit chaque ligne de `category` + `iconSlug`.
- **Chantier E — Achat → Stock** ✅ : bouton « J'ai fait mes courses » (`purchase-checkout.tsx`, confirmation « Bien joué — on range ? ») → `checkoutToStockAction` → `checkoutPurchasedToStock` (core). Les lignes cochées entrent au stock (fusion si l'article existe : présent + cumul si même unité ; sinon création), datées du jour (created_at → péremption). Puis les achats quittent la liste (coches effacées, manuels achetés supprimés). Flux entrant uniquement — ne touche pas à la décrémentation (specs 3.4). `ShoppingLine` porte désormais `foodId`. Vérifié en direct (« Riz · 500 g » coché → entré au stock daté du jour).
- **Chantier G — anti-surplus / anti-doublon** ✅ : à l'ajout d'un article, alerte non-bloquante si l'article est déjà sur la liste (« déjà sur ta liste ») ou déjà en stock (« déjà en stock (qté) — ajouter quand même ? »). La page passe le contexte liste+stock à `add-article.tsx` ; rapprochement par `foodId` puis libellé normalisé. Vérifié en direct (« Lait » → alerte stock).
- **Chantier H — cadence configurable** ✅ : migration `0010` (`household.shopping_horizon_days`, défaut 14) ; `getShoppingWindow` (core) calcule la fenêtre depuis ce réglage ; `setShoppingHorizonAction` ; sélecteur « Courses sur : Quelques jours (3 j) / 1 semaine (7 j) / 2 semaines (14 j) » dans l'en-tête. `generateShoppingList` et le checkout (E) utilisent la même fenêtre. Vérifié en direct.
- **UX-13 — undo** ✅ : `undo-toast.tsx` (`UndoToastHost` + `DeleteWithUndo`) ; les suppressions d'articles manuels et d'essentiels affichent un toast « … supprimé · Annuler » (6 s) qui restaure l'élément (`deleteManualItem`/`recreateManualItem`, `deleteRecurringItem`/`recreateRecurringItem` renvoient/réinsèrent la donnée). Vérifié : suppression + toast ; la restauration mirroite l'ajout déjà validé.
- **Reste à faire** : **mode magasin** mobile dédié (UX-14) — l'écran est déjà responsive.

### Finitions prod — classification des rayons & rapprochement catalogue — 2026-06-18
Traitement des deux frictions observées en prod (cf. CLAUDE.md « Prochaine session » §1).

- **Bug racine trouvé — dérive libellé rayon ↔ affichage** : `food.category` stockait un **libellé** (« Crémerie & œufs »…) qui devait correspondre exactement au libellé codé dans `product-assets.tsx`. 4 rayons sur 8 avaient dérivé → **29 aliments sur 76 tombaient dans « Autres »** même correctement liés. Corrigé en passant `food.category` à une **clé stable** (principe n°8) : migration `0011_category_keys` (libellés → clés `legumes`/`proteines`/`cremerie`/`boulangerie`/`epicerie`/`sucre`/`surgeles`/`boissons`), libellé/teinte/ordre/icône **dérivés** côté UI via `CATEGORIES` + helpers `categoryDef`/`categoryLabel`/`CATEGORY_ORDER`. Ajout du rayon `boulangerie` (« Pains & céréales », absent côté affichage). `categoryDef` tolère aussi les anciens libellés (rétro-compat). `page.tsx` groupe désormais par **clé** ; `add-article.tsx`/`purchase-checkout.tsx` affichent le libellé via `categoryLabel`.
- **Auto-lien des ajouts libres au catalogue** : `addManualAction` appelle `findCatalogFoodIdByLabel` (core/foods) quand aucune suggestion n'a été cliquée → un ajout texte libre est relié à un aliment de catalogue par **libellé normalisé exact** (conservateur, pas de fuzzy) → rayon + icône sans clic. Backfill des manuels existants effectué en base (8 reliés : beurre/farine/sel/poivre/oignons/carottes/oeuf ; les non-catalogue restent en « Autres »).
- **Normalisation unifiée** : nouveau module `src/lib/text.ts` (`normalizeLabel`, source unique) consommé par `shopping.ts`, `foods.ts` et `add-article.tsx` (l'anti-doublon/anti-surplus utilise désormais la même normalisation que le calcul et le lien, œ/accents/pluriel inclus).
- **Anti-surplus rétroactif (Q2 = marqueur, validé)** : un article **manuel déjà couvert par le stock** n'est plus masqué mais **signalé** par une pastille « déjà en stock (qté) » dans « À acheter » (`ShoppingLine.alreadyStocked`/`stockedLabel` calculés dans `generateShoppingList`). Cohérent avec l'alerte non-bloquante de l'ajout : on prévient, on ne décide pas à la place.
- **Vérifié** : `tsc` + `eslint` OK ; migration appliquée et **catégories = clés** confirmées en base (`legumes` 22, `epicerie` 19, `cremerie` 10, `proteines`/`sucre` 8, `surgeles` 4, `boulangerie` 3, `boissons` 2) ; manuels reliés → rayon/icône confirmés par requête. **Rendu visuel non vérifié en navigateur** (extension Claude in Chrome non connectée dans la session).
- **⚠️ Déploiement (dev = prod, même projet Supabase)** : la migration `0011` est **live** sur la base partagée, mais le frontend Netlify tourne encore sur l'ancien code par **libellés** → en prod, les rayons tombent en « Autres » **jusqu'au redeploy** du nouveau code. À pousser sur `main` pour corriger. _(Déployé : commit `1e5fca9` sur `main`.)_

### Couverture catalogue : élargissement + synonymes + classement des recettes — 2026-06-18
Constat : l'auto-lien ne couvrait que les **ajouts manuels** ; les **ingrédients de recettes en texte libre** (branche `needByLabel`) ne portaient aucun rayon → toujours « Autres ». Trois leviers combinés (validés : catalogue élargi + synonymes) :

- **Catalogue élargi** : migration `0012_seed_food_catalog_extended` → **~340 aliments** curés FR (était 76) sur les 9 rayons (legumes 83, epicerie 79, proteines 50, cremerie 30, sucre 27, boissons/boulangerie 20, maison 18, surgeles 13) + conditionnements pour les plus courants. `category` = clés stables. Idempotent.
- **Couche de synonymes** : `src/lib/food-synonyms.ts` (alias → slug canonique) pour absorber les formulations IA que le match exact rate : coupes (« filet de poulet » → poulet), qualificatifs (« persil frais », « poivre moulu »), variantes (« moutarde de Dijon » → moutarde, « jus de citron » → citron), pluriels en -x (« poireaux »). Conservateur (pas de fuzzy).
- **Classement des lignes libres au rendu** : `core/foods.ts` expose `loadCatalogIndex` + `matchCatalog` (exact puis synonymes) ; `generateShoppingList` classe désormais les besoins de recette free_text, et les récurrents/manuels non liés → rayon + icône. C'est le vrai levier anti-« Autres » pour les recettes IA.
- **Vérifié en direct** : household de test → **plus aucune section « Autres »** ; « jus de citron » → Fruits & légumes (icône citron), « anchois » → Viandes & poissons, « moutarde de Dijon » → Épicerie salée. Backfill : 14/18 manuels liés en base (exact) ; les 4 restants (synonymes) classés au rendu. `tsc`/`eslint` OK, aucune erreur console.
- **Note** : un aliment importé d'USDA/OFF arrive toujours sans rayon (`category=null`) → « Autres ». Reste à traiter (mapping catégorie à l'import) + UX-14 mode magasin mobile.

### Personnalisation des rayons : catégories foyer + déplacement + mémoire — 2026-06-18
Permet à chaque foyer de gérer les cas limites lui-même plutôt que viser l'exhaustivité du catalogue (validé : catalogue élargi **+** synonymes ; cette brique = catégories perso + mémoire).

- **Schéma** (migration `0013_household_categories`, scopé foyer + RLS `is_household_member`) :
  - `shopping_category` : rayons personnalisés (label, icône, teinte, position).
  - `household_food_pref` : préférence « libellé → rayon (+ icône) », unique par (foyer, libellé normalisé). Sert **déplacement** ET **mémoire** d'un ajout libre. `category_key` = clé intégrée OU id de rayon custom (couplage souple, pas de FK ; rayon supprimé → retombe en « Autres »).
- **Core** : `src/lib/core/categories.ts` (`listHouseholdCategories`, `createHouseholdCategory`, `deleteHouseholdCategory` qui nettoie les prefs orphelines, `setFoodPref` upsert, `clearFoodPref`, `loadFoodPrefs`). `generateShoppingList` applique l'ordre **préférence foyer → food.category → catalogue/synonymes** dans `resolve()`.
- **UI** : `category-controls.tsx` — `RangerButton` (modale par ligne : choisir un rayon intégré/custom, créer un rayon inline avec teinte, **choisir une icône** dans la banque d'assets, réinitialiser) + `MyAisles` (aside « Mes rayons » : liste/supprime/crée). Server actions `setFoodCategoryAction`/`clearFoodCategoryAction`/`createCategoryAction`/`deleteCategoryAction`. La page groupe built-ins + rayons custom (id, après les intégrés) + « Autres ».
- **Robustesse** : garde-fou auth ajouté en tête de `page.tsx` (`!userId`→/login, `!household_id`→/onboarding) — la page ne plante plus si la session expire en cours de route.
- **Vérifié en direct** : création d'un rayon « Plats préparés » + déplacement d'un article dedans (icône custom au header) ; suppression du rayon ; préférence persistée en base (mémoire par libellé). Aucune erreur console. Données de test nettoyées.
- **Reste (chantier D)** : import USDA/OFF **assisté IA** — un seul appel renvoyant `{ nom générique FR, rayon ∈ liste }` (nutrition inchangée, vient du fournisseur). + UX-14 mode magasin mobile.

### Banque d'assets enrichie (Claude Design v2) — 2026-06-18
Handoff design importé (zip déposé par l'utilisateur ; connecteur DesignSync indisponible — token `CLAUDE_CODE_OAUTH_TOKEN` sans scopes design). Source : `design/handoff-courses/apply-drawing/project/assets/produits-assets.js` (rafraîchi).

- **Produits** : `PRODUCTS` passé de ~45 à ~80 pictos doodle. Icônes refaites (citron — il « ne ressemblait pas à un citron » —, herbes) ; nombreux ajouts (fruits/légumes : poire, raisin, pêche, ananas, mangue, melon, kiwi, avocat, pomme de terre, courgette, aubergine, concombre, maïs, poireau, chou-fleur, courge, betterave, radis, asperge, petits pois, gingembre, piment ; viandes/poissons : filet de poisson, crevette, steak, saucisse ; crémerie : fromage-bloc, crème ; boulangerie : baguette, croissant, pâte à dérouler ; épicerie : épices, sauce, salière, bocal, noix, sucre ; boissons : bière, lait végétal, canette ; plats : plat préparé, tofu, burger ; maison : essuie-tout, mouchoirs, spray, lessive).
- **`CATEGORY_ICONS`** (nouveau) : emblèmes génériques de rayon (panier, chariot, étiquette, étoile, cœur, feuille, flocon, bouteille, pot, sac, boîte, marmite, soleil, épi) pour la création de rayons personnalisés.
- **Intégration** : `ProductDef.cat` relâché en `string` (le regroupement « showcase » de la banque est indépendant des rayons DB) ; `_byKey` fusionne PRODUCTS + CATEGORY_ICONS → `ProductIcon`/`resolveProduct` rendent les deux. `category-controls.tsx` : picker d'icône **article** = PRODUCTS, picker d'icône **rayon custom** = CATEGORY_ICONS (état `newIcon` distinct). Vérifié en direct : citron correct, grilles produits + emblèmes OK, aucune erreur console.

### Chantier D : import USDA/OFF assisté IA (nom générique FR + rayon) — 2026-06-18
Règle le double agacement des imports USDA/OFF (noms verbeux + marques ; aucun rayon).

- **`src/lib/ai/categorize-food.ts`** : `classifyImportedFood(rawName)` → `{ name, category }` via la couche Groq (mode JSON, `temperature: 0`, zod). `name` = nom générique COURT en FR (sans marque/détails) ; `category` = rayon d'une **liste fermée** (clés intégrées) ou `null`. Best-effort : échec/indispo/JSON invalide → `null`.
- **Branchement** : `importFood` (core/foods) appelle le classifieur (import dynamique, try/catch) **uniquement à la création** d'un aliment externe → `food.name` = nom FR, `food.category` = rayon. **Nutrition inchangée** : toujours issue du fournisseur (garde-fou n°3). Repli si IA absente : nom brut + rayon vide.
- **Affichage courses** : `addManualAction` utilise le nom de l'aliment lié (générique/curé) comme libellé de la ligne plutôt que la saisie brute → l'app reste générale (ex. « Cheese, parmesan, grated… » → « Parmesan »).
- **Vérifié en direct** : « SALMON » (USDA) importé → **« Saumon »**, rangé en **Viandes & poissons**, **9 valeurs nutritionnelles conservées**. `tsc`/`eslint` OK, aucune erreur console. Données de test nettoyées.

### UX-14 mode magasin + finition modale « Ranger » — 2026-06-18
- **Mode magasin** (`src/app/(app)/courses/magasin/page.tsx`, État 8 de la maquette) : vue plein écran « En magasin » — barre de progression (cochés/total), liste par rayon en **gros boutons** (taper la ligne = cocher, ≥64 px), coché = case verte + barré sur place, **CTA collant** « J'ai fait mes courses » (`PurchaseCheckout` en variante `fullWidth`). Entrée via un bouton **« Mode magasin »** dans l'en-tête de la liste (visible s'il y a des articles).
- **Refactor** : groupement par rayon extrait dans `src/app/(app)/courses/rayons.ts` (`catView`, `groupByRayon`), partagé par `page.tsx` et le mode magasin.
- **Finition** : la modale « Ranger » avait ses coins **arrondis à gauche mais carrés à droite** car la barre de défilement s'appliquait à la carte arrondie ; corrigé en scrollant un **wrapper intérieur** (la carte extérieure `overflow-hidden rounded-2xl` clippe les coins).
- **Vérifié en direct** : mode magasin (coche → barré + progression 1/6 + CTA collant), modale « Ranger » coins OK, aucune erreur console.

### Finition autocomplétion : « Ajouter mon texte » — 2026-06-18
Bug UX signalé : en tapant un article **hors catalogue** (ex. « Vin de cuisine »), la liste déroulante (suggestions externes) recouvrait le bouton « Ajouter à la liste » → impossible de garder son texte et valider. Corrigé dans `add-article.tsx` : une option **« ＋ Ajouter « \<texte\> » »** apparaît **en tête** du menu dès 2 caractères (avant la section « Suggestions »), et soumet le libellé libre tel quel (`requestSubmit`). Le menu s'ouvre dès la saisie (même sans résultat). Vérifié en direct.

### Classement IA des ajouts libres + création de rayon plus accessible + palette élargie — 2026-06-18
Trois retours utilisateur traités ensemble.

- **IA sur le texte libre** : `addManualAction` — quand un ajout libre n'est reconnu ni par le catalogue ni par un import, on appelle `classifyImportedFood` pour obtenir un **rayon** (liste fermée, best-effort) et on le **mémorise** en préférence foyer → la ligne est classée (plus « Autres ») et reclassée ensuite. Nutrition non concernée (garde-fou n°3). Indicateur « Ajout… » sur le bouton (latence IA). Vérifié : « kombucha » → **Boissons**.
- **Créer un rayon, accessible** : bouton **« ＋ Ajouter un rayon »** en bas de « À acheter » (au lieu de l'aside) → mini-modale (`ManageAislesButton`) : nom + couleur + icône + liste/suppression des rayons existants. L'ancienne section aside « Mes rayons » est retirée. Coque de modale factorisée (`Modal`), scroll intérieur (coins ronds).
- **Palette élargie** : `RAYON_PALETTE` (product-assets) passe à **10 teintes** pastel (vert, beurre, terracotta, bleu, lavande, rose, menthe, pêche, prune, ardoise) + `rayonInk(tint)` pour l'encre lisible ; `catView` (rayons.ts) et les pickers (`ColorSwatches`) la consomment.
- Vérifié en direct : bouton + modale (10 couleurs), classement IA « kombucha » → Boissons, aucune erreur console ; données de test nettoyées.

### Liste « À acheter » interactive : DnD entre rayons + coche animée + bouton rayon en haut — 2026-06-18
- **Bouton « ＋ Ajouter un rayon » remonté en HAUT** de « À acheter » (sous l'en-tête) — plus besoin de scroller toute la liste pour créer un rayon.
- **Glisser-déposer entre rayons** : la liste active devient un composant client `shopping-list.tsx`. Chaque ligne a une **poignée ⠿** ; au glissé (Pointer Events → souris + tactile), une **tuile fantôme suit le curseur/doigt**, le rayon survolé se surligne, et au dépôt l'article est **déplacé + mémorisé** (`setFoodCategoryAction`). `data-rayon` sur chaque section pour la détection via `elementFromPoint`. `touch-action:none` sur la poignée pour ne pas scroller pendant le glissé.
- **Coche animée** : au clic sur la pastille, elle **se remplit en vert (✓)** et la ligne **s'atténue** (transition) avant de basculer en « Déjà pris » — fin de la confusion « la tuile disparaît sans feedback ». Coche via server action (optimiste, `useTransition`).
- Vérifié en direct : drag « Poulet » → Fruits & légumes (déplacé + persisté) ; coche « Tomate » (pastille verte + atténuation → Déjà pris) ; aucune erreur console ; données de test nettoyées.

### Décoche animée + retrait « Mes essentiels » + « supprimer » rétabli — 2026-06-18
- **Décoche animée** : la section « Déjà pris » devient elle aussi cliente (`DoneList`). Au décochage, la pastille **se vide** et la ligne **s'atténue** avant le retour dans « À acheter » (symétrique de la coche). Ligne factorisée (`Row` + hook `useToggle`) partagée par `ShoppingList` (mode `active`) et `DoneList` (mode `done`) ; l'état visible pendant l'animation est l'état CIBLE.
- **« Mes essentiels » retiré** (aside) — jugé peu intuitif/utile au départ ; à retravailler plus tard. Les essentiels existants continuent d'alimenter la liste (provenance « essentiel ») ; seules la gestion (aside) et ses requêtes (`recurring`, `foods`) sont retirées. `addRecurringAction` conservée pour la future refonte.
- **Régression corrigée** : le « supprimer » des articles manuels actifs, perdu lors du passage à la liste cliente, est rétabli (`DeleteWithUndo` dans `Row`).
- Vérifié en direct : décoche « Lait » (pastille vidée + atténuation → retour « À acheter ») ; aside sans « Mes essentiels » ; « supprimer » présent ; aucune erreur console.

### Finition autocomplétion : « Utiliser mon texte » ne soumet plus directement — 2026-06-18
L'option de tête « Ajouter « \<texte\> » » **soumettait le formulaire immédiatement**, sans laisser régler la quantité. Renommée **« Utiliser « \<texte\> » · texte libre »** et son clic **confirme** désormais le libellé (sélection synthétique free-text : ferme la liste, garde le nom dans le champ) **sans soumettre** — l'utilisateur règle ensuite Qté/unité puis « Ajouter à la liste ». Vérifié : « oeufs » → Utiliser → Qté 6 → Ajouter → « Œufs · 6 » en Crémerie & œufs.

### « J'ai fait mes courses » déplacé dans « Déjà pris » + édition qté/unité inline — 2026-06-18
- **CTA déplacé** : « J'ai fait mes courses » quitte l'en-tête de « À acheter » pour le **bas de la section « Déjà pris »** (full-width), là où c'est logique (action sur les articles cochés). La section « Déjà pris » devient une `section` (carte) : liste repliable `<details open>` + CTA toujours visible dessous. L'en-tête « À acheter » ne montre plus que « N déjà pris ».
- **Édition qté/unité inline** (articles manuels) : la quantité affichée devient un bouton (« + qté » si vide) qui ouvre un éditeur en ligne (champ nombre + select d'unité + ✓) → `updateManualItemAction` (maj `shopping_manual_item`). Plus besoin de supprimer/re-ajouter. `SLine` porte désormais `quantity`/`unit` bruts. Vérifié : « Riz » → + qté → 500 g enregistré ; CTA bien dans « Déjà pris ».

### Fusion inter-sources + sommes sensibles aux unités — 2026-06-18
**Problème** : un même ingrédient pouvait apparaître en plusieurs lignes (une par recette + manuel + récurrent), et les quantités ne se cumulaient pas si les unités différaient (`1 L` de lait + `50 cl` restaient deux lignes). L'utilisateur devait « repasser en rayon » pour le même produit.

**Solution** (`src/lib/core/shopping.ts`, `generateShoppingList`) :
- **Une seule ligne par identité produit.** Clé canonique `cf:<foodId>` (aliment lié) ou `cl:<libellé normalisé>` (texte libre). Toutes les contributions — besoins recette (`netNeed`/`netLabelNeed`), récurrents, manuels — passent par un unique `contribute()` qui agrège dans une `Map<key, Merged>`. `ShoppingLine` porte désormais `sources: ShoppingSource[]` (toutes les provenances → un badge chacune), `manualIds: string[]` (tous les manuels fusionnés), `manualOnly` (édition/suppression qté seulement si 100 % manuel).
- **Sommes sensibles aux unités.** `QtyAcc` + `addQty`/`finalizeQty` somment **par dimension** via `toBase`/`fromBase` (`src/lib/units.ts`) : g/kg → mass, ml/cl/dl/L → volume, pièce → count. Affichage dans l'unité **la plus fréquente**. Unité inconnue ou dimensions mêlées (g + L) → repli somme brute (précision approximative assumée).
- **État coché unifié.** Coche/décoche **toujours** via `shopping_item_state` par clé canonique (`toggleCheckAction`) ; abandon de `shopping_manual_item.checked` (et de `toggleManualCheckAction`, supprimée). `clearCheckedAction` ne purge plus que `shopping_item_state` ; `checkoutPurchasedToStock` supprime les manuels via `lines.flatMap(l => l.manualIds)`. Mode magasin aligné sur la même clé.
- **Vérifié en direct** : Lait (manuel `1 L` + manuel `50 cl` + récurrent `2 L`) → **une** ligne « Lait » en Crémerie, badges `essentiel`+`ajouté`, **3.5 L** ; Farine (`500 g` + `1 kg`) → **1500 g** ; coche → la ligne fusionnée bascule d'un bloc dans « Déjà pris ».

### Auto-catégorisation des textes libres de recette + « Ajouter un rayon » anti-doublon — 2026-06-18
**Problème** : un ingrédient texte libre de recette non rapproché du catalogue (ex. « bœuf en cubes ») tombait en « Autres » — l'IA ne classait que les ajouts manuels et les imports USDA/OFF, pas le texte libre des recettes. Et pour le recatégoriser, l'utilisateur ne voyait pas le rayon « Viandes & poissons » s'il était vide ; il était tenté de **recréer** un rayon « Viande » alors que le prédéfini existe déjà.

**Solution** :
- **`generateShoppingListAutoSorted`** (`src/lib/core/shopping.ts`) enveloppe `generateShoppingList` : les lignes en « Autres » (texte libre, `category == null && foodId == null`) sont classées via `classifyImportedFood` (IA, liste fermée de rayons, best-effort, parallèle, plafonné à 16) puis **mémorisées** en préférence foyer (`setFoodPref`, une fois par libellé) ; le rayon est appliqué en mémoire pour un rendu immédiat. `generateShoppingList` reste pur (checkout). Les deux pages Courses (`page.tsx`, `magasin/page.tsx`) utilisent la variante. Garde-fou n°3 : le rayon n'est pas une donnée nutritionnelle.
- **`ManageAislesButton`** (« Ajouter un rayon », `category-controls.tsx`) : la modale liste d'abord les **rayons prédéfinis** (chips info non cliquables) avec « range tes articles dedans avec « Ranger » », puis la création custom sous « Créer un rayon perso ». Garde-fou anti-doublon : si le nom saisi correspond (normalisé) à un rayon prédéfini OU custom existant, message « « X » existe déjà — inutile de le recréer » + bouton **désactivé**.
- **Rappel** : le bouton **« Ranger »** d'une ligne proposait déjà *tous* les rayons prédéfinis (même vides) — déplacer un article vers « Viandes & poissons » n'a jamais nécessité de recréer un rayon.
- **Vérifié en direct** : « bœuf en cubes » (texte libre) → **Viandes & poissons** ; « Ajouter un rayon » montre les 9 rayons prédéfinis ; saisir « Boissons » → message doublon + création bloquée.

### Recette → liste de courses : « Ajouter les ingrédients manquants » — 2026-06-18
**Problème** (trouvé pendant un test de bout en bout) : une recette **déjà enregistrée** n'avait aucun moyen d'envoyer ses ingrédients vers la liste. Le bouton « propose les manquants → valide » n'existait que dans le flux **Générer (IA)** (brouillon non sauvegardé) ; pour une recette sauvegardée, seul le **planning** alimentait la liste (dynamique). Flux décrit par l'utilisateur impossible tel quel.

**Solution** :
- **`recipeMissingIngredients(db, householdId, recipeId)`** (`src/lib/core/shopping.ts`) : ingrédients de la recette **non couverts par le stock** (même logique de couverture que `generateShoppingList`). Couverture extraite dans **`loadStockCoverage`** (helper partagé : présence + quantités réconciliées par dimension), désormais utilisé par `generateShoppingList` ET `recipeMissingIngredients` (DRY, comportement préservé).
- **`addRecipeMissingToShoppingAction(recipeId)`** (`src/app/(app)/recettes/[id]/actions.ts`) : insère les manquants en `shopping_manual_item`, **liés au catalogue** (`recipe_ingredient.food_id` sinon `findCatalogFoodIdByLabel`) → rayon + icône déterministes ; les libellés inconnus sont classés par l'auto-catégorisation au rendu. Fusion automatique si l'ingrédient est déjà sur la liste. @returns le nombre ajouté.
- **UI** : `add-missing-to-shopping.tsx` (bouton client sous la liste d'ingrédients du détail recette) — reste sur la page et affiche « N ingrédients ajoutés · Voir la liste » (ou « Tout est déjà en stock »).
- **Vérifié en direct (circuit complet)** : « Omelette au parmesan à l'huile d'olive » → **5 ajoutés** → Œufs/Parmesan/Lait en **Crémerie & œufs**, Huile d'olive en **Épicerie salée**, Sel **fusionné** avec le Sel existant en Épicerie salée. Données de test nettoyées.

### Historique des courses — 2026-06-18
À chaque « J'ai fait mes courses » validé, on archive un **relevé daté** des articles achetés. Pur suivi des achats passés (aucun lien avec le stock). Base extensible pour de futures stats Courses.

- **BDD** : migration `0014_shopping_history` — `shopping_trip` (date, `is_favorite`, `name`) + `shopping_trip_item` (snapshot immuable : libellé, qté, unité, `category_key`, `food_id`, `icon_slug`, `source`). RLS foyer (`is_household_member`) + grants. Types régénérés.
- **Backend** (`src/lib/core/shopping-history.ts`) : `recordShoppingTrip` (branché dans `checkoutPurchasedToStock` — archive les lignes cochées), `listShoppingTrips(page)` (**favoris d'abord** puis chronologique, **5/page**), `purgeOldShoppingTrips` (non-favoris > 1 mois), `setTripFavorite`, `renameTrip`, `deleteTrip`, `updateTripItem`, `deleteTripItem`, `reconductTripItems` (ré-ajout sélectif → `shopping_manual_item`, lié au catalogue). Couverture stock factorisée dans `loadStockCoverage`.
- **UI** : page **`/courses/historique`** (lien « Historique » dans l'en-tête Courses). Relevés dépliables : date OU nom + **nb d'articles** + ⭐ favori ; déplié → articles (icône, rayon, provenance, qté **éditable**, retrait). Actions : **Reconduire** (modale de sélection cochable → liste actuelle), **Renommer**, **Supprimer**. Pagination Précédent/Suivant. Note de purge auto. Purge appelée à l'ouverture.
- **Vérifié en direct** : 6 relevés de test → favori (le plus ancien) **en tête**, compteurs corrects, dépliage OK, **reconduction** de 3/4 articles (1 décoché ignoré) → ajoutés aux bons rayons, **Page 1/2**. Données de test nettoyées.
- **Plus tard** (noté dans CLAUDE.md) : onglet « Statistiques » sur l'historique (fréquence de rachat, taille de panier…), puis équivalents Stock (nécessite un journal de mouvements) et Recettes.

#### Affinages historique + recherche (suite — 2026-06-18)
- **Sécurité suppression** : le détail d'un relevé est **lecture seule par défaut** (plus de 🗑 visible) ; bouton **« Éditer »** révèle l'édition qté + retrait, et **chaque retrait demande confirmation** (« Retirer ? Oui/Non ») — fini les suppressions par mégarde.
- **Articles groupés par rayon** dans les relevés (sections `<details>` **repliables** + compteur) → relisible même à 100+ articles, on ne déplie que les rayons voulus. Rayons custom résolus (la page charge `listHouseholdCategories`).
- **Recherche** : champ de filtre dans un relevé (> 6 articles) **et** dans la liste de courses principale (`ShoppingList`, > 6 articles) — filtre par libellé, rayons vidés masqués.
- **Reconduction** : bouton **« Tout cocher / Tout décocher »** dans la modale → permet de ne reconduire qu'un seul article (tout décocher puis cocher celui voulu). Vérifié en direct.

### Onglet Statistiques (analyse marché + périmètre large) — 2026-06-18
Précédé d'une **analyse marché** (Listonic budget/prix, AnyList favoris/recettes, Bring faible en insights, KitchenPal basé garde-manger) → cf. décisions : périmètre **large**, **prix optionnel**, **rétention 6 mois**. Stats **limitées aux courses** (pas de stock). Notre différenciateur : la **provenance** (repas/essentiel/ajouté), qu'aucun concurrent n'a.
- **BDD** : migration `0015` — `shopping_trip_item.price` (numeric, nullable). Rétention `purgeOldShoppingTrips` → **6 mois** (`TRIP_RETENTION_MONTHS`).
- **Prix** : saisi **au checkout** (champ € par article dans « J'ai fait mes courses ») ET éditable ensuite **dans le relevé** (mode Éditer). Threadé par clé de ligne jusqu'à `recordShoppingTrip`. **Pré-remplissage du dernier prix payé** par produit au checkout (`getLastKnownPrices` → `essentialKey`, modifiable) — réduit la re-saisie ; le prix reste un snapshot par relevé, pas un attribut figé du produit.
- **Backend** : `src/lib/core/shopping-stats.ts` (`computeShoppingStats`, lecture seule) : cadence (courses/sem, jours entre deux, dernière), panier moyen + série (sparkline), top produits + quantités, répartition par rayon, provenance, **fréquence de rachat → « À racheter bientôt »** (intervalle médian dépassé), évolution hebdo, one-shots, et **dépenses** (total, panier moyen €, par rayon) si prix.
- **UI** : bascule **Historique / Statistiques** (`tabs.tsx`), page `/courses/historique/stats` (cartes + barres/sparkline SVG-CSS maison). **« À racheter bientôt »** actionnable (`due-soon.tsx` → `addProductToListAction`, ajout 1 clic à la liste, lié catalogue). Cold-start si < 2 relevés.
- **Vérifié en direct** (4 relevés de test + prix) : cadence 1.8/sem, dépenses 39,20 € / panier 9,80 € / par rayon, « À racheter bientôt » (Lait en retard, Œufs aujourd'hui → +Ajouter OK), top produits, provenance 13/35/52%, évolution hebdo, one-shots. Données de test nettoyées.
- **Suite** (CLAUDE.md) : équivalents Stock (nécessite un journal de mouvements) et Recettes.

### Refonte « essentiel » — modèle hybride (auto-propose + 1 clic) — 2026-06-18
**Problème** : le concept « essentiel » (produit récurrent) était **orphelin** — la table `shopping_recurring_item`, le badge `🔁 essentiel` et la part « essentiels » des stats existaient, mais **aucune UI ne créait d'essentiel** (le panneau « Mes essentiels » avait été retiré). L'utilisateur ne rencontrait jamais le moment de déclarer un essentiel ⇒ concept incompréhensible. De plus, « À racheter bientôt » (stats) **détecte déjà** les rachats fréquents → la déclaration manuelle faisait doublon.

**Solution (hybride, validée avec l'utilisateur)** : l'app **détecte**, l'utilisateur **confirme en 1 clic**.
- **Promotion** : `promoteToEssentialAction` (anti-doublon par aliment/libellé). Deux points d'entrée : (a) bouton **« ★ Toujours »** dans « À racheter bientôt » ; (b) **épingle ☆** sur chaque ligne de courses (`shopping-list.tsx`, promeut ; ★ plein = déjà essentiel, géré ailleurs). Qté = moyenne observée.
- **Effet** : le produit devient récurrent → **revient tout seul** dans la liste (badge essentiel) chaque cycle ; il **disparaît de « À racheter bientôt »** (exclusion via `essentialKey` dans `computeShoppingStats`).
- **Gestion** : composant réutilisable `essentials-manager.tsx` (puces + désépinglage ×, `removeEssentialAction`) affiché **sur la page stats** (carte « Mes essentiels ») **et** en **aside de la liste de courses** (« Gérer » → stats). Core : `listRecurringItems` (shopping.ts).
- **Les 3 provenances** (repas / essentiel / ajouté) restent, mais « essentiel » est enfin **concret et sans saisie à froid**.
- **Vérifié en direct** : ★ Toujours (Lait) → exclu de « À racheter bientôt » + apparaît en essentiel dans la liste (★ plein, badge) + chip « Mes essentiels » ; épingle ☆ (Beurre) → idem ; × → retrait. Données de test nettoyées. Pas de migration.

### Fiche produit — 2026-06-18
Page `/courses/produit/[foodId]` : « choisir un aliment et obtenir des infos dessus ». Précédée d'une vérif des données (important — garde-fou n°3 : on n'invente rien).
- **Évolution du prix** (graphe SVG) + dernier/moyen/min/max — depuis l'historique des prix payés. `computeProductStats` (`core/shopping-product.ts`).
- **Habitudes** : nb d'achats, fréquence (intervalle médian), dernier achat, quantité type, provenance (repas/essentiel/ajouté) pour CE produit.
- **Nutrition** : **à la demande** — le catalogue n'a aucune nutrition stockée (0/340), donc bouton « Récupérer la nutrition (USDA/OFF) » → `fetchAndStoreNutrition` (persiste `nutrient_value`, affiche). **Jamais l'IA** pour les valeurs (garde-fou n°3) ; en revanche l'IA **traduit le nom FR en terme de recherche EN** (`ai/translate-food.ts`) car USDA est anglophone (« Œufs » ne matchait rien → « egg »), puis prend le 1er résultat fournisseur AVEC nutriments. `getFoodNutrition` lit le stocké.
- **Conservation par lieu de stockage, usages FR** : **estimée par IA** à la demande (`ai/product-conservation.ts` → `{ storage ∈ placard/frigo/congelateur, durée, note }`), **indicative**. Choix validé avec l'utilisateur : repères communs, l'IA les estime correctement et par produit (corrige le défaut d'une table curée trop grossière qui mettait le poireau au placard). Ex. **Œufs** : placard (hors frigo en FR) ; **Poireau** : frigo. La table curée `conservation_guideline` (0016) a été **retirée** (migration `0017`). `conservation_rule` (0007) reste pour `getStockWithExpiry`.
- **Conseils** : **à la demande**, IA (`src/lib/ai/product-tips.ts`), **indicatifs** (qualité/saison/sourcing/anti-gaspi), étiquetés ; jamais de chiffres nutritionnels ni de durées.
- **Entrées** : produits cliquables dans les stats (Tes incontournables, À racheter bientôt) + **picker** de recherche (`product-picker.tsx` → `resolveCatalogFoodAction`, import paresseux d'un externe). Actions : `produit/[id]/actions.ts`. **Pas de migration.**
- **Vérifié en direct** (Lait, 4 prix) : graphe d'évolution, habitudes, nutrition récupérée d'USDA/OFF + persistée, conservation 7 j/4 j, conseils IA indicatifs. Données de test nettoyées.
