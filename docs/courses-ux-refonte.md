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
| — | UX-14 mode magasin mobile | ✅ (maquette) | ⏳ |

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
- **⚠️ Déploiement (dev = prod, même projet Supabase)** : la migration `0011` est **live** sur la base partagée, mais le frontend Netlify tourne encore sur l'ancien code par **libellés** → en prod, les rayons tombent en « Autres » **jusqu'au redeploy** du nouveau code. À pousser sur `main` pour corriger.
- **Reste (suite)** : couverture catalogue long-tail (bœuf, poireaux, vin rouge, herbes… non liés car hors catalogue curé → étendre le seed ou s'appuyer sur l'import USDA/OFF) ; UX-14 mode magasin mobile.
