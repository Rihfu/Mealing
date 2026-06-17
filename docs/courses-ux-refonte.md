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
| 1 | A — Modèle mental | ⏳ | — |
| 2 | B — Unités normalisées | ⏳ | — |
| 3 | C — Explication du cycle | ⏳ | — |
| 4 | D — Catalogue + autocomplétion | ⏳ | — |
| 5 | E — Achat → Stock daté | ⏳ | — |
| 6 | H — Cadence configurable | ⏳ | — |
| — | F — Tri par rayon (après D) | ⏳ | — |
| — | G — Anti-surplus/doublon (après D) | ⏳ | — |

_Mise à jour après chaque chantier._
