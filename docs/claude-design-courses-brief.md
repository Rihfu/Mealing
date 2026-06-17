# Brief Claude Design — Refonte de la section « Courses / Liste de courses » (Mealing)

> À coller dans Claude Design. Objectif : redessiner toutes les occurrences de la section
> Courses en haute-fidélité, **desktop + mobile**, en repartant des maquettes existantes et du
> design system déjà en place.

---

## Contexte produit

Mealing est une PWA familiale de gestion des repas : **planning de repas + recettes + stock +
péremption + liste de courses + foyer partagé + assistant IA**, le tout intégré. Public :
usage perso/familial. Ton : chaleureux, simple, rassurant.

Tu redessines **uniquement la section « Liste de courses »**, mais en cohérence totale avec les
autres écrans déjà conçus (Planning, Stock, Nutrition, Assistant).

### Principes directeurs à respecter (importants)
- **Confirmation par défaut** : la liste se calcule automatiquement ; l'utilisateur ne doit pas
  avoir l'impression de remplir un formulaire. L'auto est la valeur par défaut.
- **Précision approximative assumée** : pas de surcharge de champs ; on vise le confort, pas l'exactitude comptable.
- **Charge mentale minimale** : un nouvel utilisateur doit comprendre l'écran en 5 secondes.

## Design system (à réutiliser, ne pas réinventer)
- Repartir des **maquettes haute-fidélité existantes** (handoff desktop + mobile déjà livrés) et
  des **tokens** du design system : couleurs (fond crème, vert primaire), polices **Fraunces**
  (titres), **Nunito** (texte), **Caveat** (accent manuscrit, ex. tagline), rayons arrondis,
  ombres douces (`shadow-soft`), primitives `btn-primary/secondary/danger`, `card`, `field-input`.
- **Icônes Lucide** (prévu par le handoff) — propose des icônes cohérentes par rayon/action.
- **Pas de dark mode** (neutralisé). Accessibilité : cibles tactiles ≥ 44px, contrastes AA.

---

## Le « job » de l'utilisateur (cadre la conception)

La liste de courses est une étape d'un cycle complet — la refonte doit raconter ce cycle :
```
1. DÉCIDER  quand je fais les courses (jour fixe, hebdo, bi-hebdo, plusieurs fois/sem.)
2. PRÉPARER la liste (auto depuis repas + essentiels + ajouts ; dédoublonnée ; sans surplus)
3. ACHETER  (lecture facile en magasin : tri par rayon, cocher au pouce, une main)
4. RANGER   (les achats entrent au stock, datés → péremption)
```

## Problème de l'écran actuel (à corriger)
L'écran actuel expose la **plomberie** : trois blocs « Repas à venir / Récurrents / Ajouts
manuels » au jargon obscur. L'utilisateur est perdu. Saisie d'article sans suggestion, unité en
texte libre. Pas de notion de « faire ses courses » puis « ranger ».

---

## Écrans & états à produire (desktop ET mobile)

### 1. Liste de courses — état principal (avec articles)
- **Une seule liste « À acheter »** (plus de 3 silos). Chaque ligne porte une **puce de provenance
  discrète** : `🍽 repas` (issu d'un repas planifié), `🔁 essentiel`, `✏️ ajouté`.
- **Regroupement par rayon / catégorie** (Fruits & légumes, Frais, Épicerie, Surgelés…), en
  **sections repliables**, pour rester lisible même avec une longue liste (gros foyer). Prévois
  l'idée que l'ordre des rayons sera **personnalisable** selon le magasin.
- **Cocher au fur et à mesure** : item coché = barré, animation légère, passe en « Déjà pris ».
- Section **« Déjà pris (N) » repliable** en bas + action **« Tout décocher »**.
- Quantité + unité affichées proprement (ex. « Lait · 1 L »).

### 2. État vide
- Quand il n'y a rien à acheter (tout en stock / pas de repas) : message encourageant + accès
  rapide à « ajouter un article » et au planning.

### 3. Ajout d'un article (le moment clé — réduire la friction)
- Champ avec **autocomplétion** : dès 2 lettres, suggestions d'aliments du catalogue (montre l'état
  ouvert avec une liste de suggestions, ex. « riz » → Riz basmati, Riz complet…).
- Proposer des **formats/conditionnements courants** en 1 clic (ex. Riz 1 kg / 500 g).
- **Unité = liste déroulante** (—, pièce, g, kg, ml, cl, L, paquet, boîte, sachet, botte), jamais
  du texte libre. Quantité en numérique.
- Objectif : **ajouter en 1–2 gestes** (le marché monte jusqu'à 34 taps — à éviter absolument).
- **Alerte anti-surplus / anti-doublon** : si l'article est déjà en stock suffisant ou déjà dans
  la liste, l'indiquer en ligne (non bloquant).

### 4. « Mes essentiels » (gestion des récurrents renommés)
- Panneau/écran pour gérer les produits qu'on rachète régulièrement (ajout, suppression).
- Renommer « Produits récurrents » → **« Mes essentiels »**.

### 5. « J'ai fait mes courses » → Achat ➜ Stock
- Action de fin de courses : un **récapitulatif** des articles cochés qui vont **entrer au stock**
  (avec date d'achat, utile pour la péremption). Confirmation claire, réversible.
- C'est le moment qui « boucle le cycle » — soigne-le.

### 6. Sélecteur de cadence
- Réglage du rythme de courses : **hebdomadaire / toutes les 2 semaines / jour de courses fixe**.
  Place-le de façon discrète (en-tête ou réglages de la liste).

### 7. Annulation (undo)
- Après une suppression ou un décochage, proposer une **annulation** (toast « Annulé · Annuler »).
  C'est la frustration n°1 des apps concurrentes — on doit l'avoir.

### 8. Mode magasin (mobile, prioritaire)
- Vue optimisée pour l'usage **en rayon** : gros boutons, cochage au pouce d'une main, texte
  lisible, peu de distractions. Pense « je tiens mon panier d'une main ».

---

## Copies / ton (français)
- Sous-titre de la liste, en clair : *« Ta liste se met à jour toute seule : on part de tes repas,
  on retire ce que tu as déjà en stock, et tu ajoutes ce que tu veux. Coche au fur et à mesure. »*
- Éviter le jargon (« récurrent », « ajout manuel »). Préférer « essentiel », « ajouté ».

## Livrable attendu
- Maquettes haute-fidélité **desktop + mobile** pour chacun des états 1 à 8 (au minimum 1, 3, 5, 8).
- Export exploitable pour implémentation (HTML/CSS aux tokens du design system, dans `design/exports/`
  ou un nouveau handoff), cohérent avec les écrans existants.
- Indiquer les **icônes Lucide** retenues et l'organisation des **rayons** proposée.
