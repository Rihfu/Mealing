# Brief Claude Design — Mise à jour « Courses » + nouvel écran « Historique des courses » (Mealing)

> À coller dans Claude Design. Fait suite au brief Courses précédent (`claude-design-courses-brief.md`).
> Objectif : intégrer aux maquettes Courses les fonctionnalités ajoutées récemment, et concevoir
> le **nouvel écran Historique des courses**. Desktop **et** mobile.

---

## Contexte

Mealing = PWA familiale de gestion des repas (planning, recettes, stock, péremption, **liste de
courses**, foyer partagé, assistant IA). Ton : chaleureux, simple, rassurant. Tu travailles
**uniquement la section Courses**, en cohérence totale avec les écrans déjà conçus.

### Design system (réutiliser, ne pas réinventer)
- Tokens existants : fond crème, vert primaire, polices **Fraunces** (titres), **Nunito** (texte),
  **Caveat** (accent manuscrit), rayons arrondis, ombres douces (`shadow-soft`), primitives
  `btn-primary/secondary/danger`, `card`, `field-input`.
- **Icônes Lucide**. **Pas de dark mode**. Cibles tactiles ≥ 44px, contrastes AA.
- Repartir des maquettes Courses haute-fidélité déjà livrées (desktop + mobile).

---

## Partie A — Mises à jour de l'écran « Liste de courses » existant

Intégrer ces évolutions déjà en place côté produit :

1. **Une seule ligne par ingrédient, fusionnée entre sources.** Un même produit issu de plusieurs
   origines (plusieurs recettes + essentiel + ajout manuel) n'apparaît **qu'une fois**, avec la
   **somme des quantités** (sensible aux unités : 1 L + 50 cl = 1,5 L). La ligne peut donc porter
   **plusieurs puces de provenance** côte à côte (ex. `🍽 repas` + `✏️ ajouté`). Prévois le rendu
   d'une ligne avec 1, 2 ou 3 puces.
2. **Rangement automatique fiable.** Chaque article est rangé dans le bon rayon automatiquement
   (catalogue + IA pour le texte libre des recettes). Le rayon « Autres » devient rare → soigne
   surtout les rayons nommés ; « Autres » reste un cas de repli discret.
3. **« Ajouter un rayon » revu.** La modale de création de rayon montre **d'abord les rayons
   prédéfinis existants** (Fruits & légumes, Viandes & poissons, Crémerie & œufs, Pains & céréales,
   Épicerie salée, Épicerie sucrée, Surgelés, Boissons, Maison & entretien) en rappelant « range
   tes articles dedans avec Ranger », **puis** la création d'un rayon perso (avec garde-fou si le
   nom existe déjà). Conçois cette modale (état « rayons existants » + état « créer un perso » +
   message anti-doublon).
4. **Édition de quantité en ligne.** Sur un article manuel, la quantité est un petit bouton qui
   ouvre un éditeur en ligne (champ nombre + sélecteur d'unité + valider). Pas de supprimer/ré-ajouter.
5. **Entrée « Historique »** dans l'en-tête de la liste (à côté de « Mode magasin ») → mène au
   nouvel écran ci-dessous.

### Lien depuis Recettes (à illustrer brièvement)
Sur la **page détail d'une recette**, un bouton **« Ajouter les ingrédients manquants à ma liste de
courses »** (sous la liste d'ingrédients) ajoute en un geste ce qui manque (vs stock), puis affiche
« N ingrédients ajoutés · Voir la liste ». Propose le style de ce bouton + son message de confirmation.

---

## Partie B — NOUVEL écran « Historique des courses » (le gros morceau)

### Intention
Après chaque « J'ai fait mes courses » validé, on enregistre un **relevé daté** de ce qui a été
acheté (libellés + quantités). L'utilisateur consulte ses **courses passées** pour se rappeler ce
qu'il avait pris la dernière fois et ce qui lui manque — **sans lien avec le stock** (pur suivi).

### Liste des relevés
- **Tri** : les relevés **favoris** d'abord (épinglés en tête), puis les autres en **ordre
  chronologique décroissant** (plus récent en haut).
- **Pagination** : afficher **5 relevés par page**, avec navigation **Précédent / Suivant** (et un
  indicateur de page). Pas de scroll infini.
- **Chaque relevé (replié)** affiche : la **date** d'achat, le **nombre d'articles** bien visible
  (sert à distinguer d'un coup d'œil un mini-achat ponctuel d'une grosse course hebdo), une **étoile
  favori** (active/inactive), et un **nom personnalisé** s'il a été renommé (sinon, la date fait office).
- **Déplier un relevé** (carte/accordéon) → la **liste des articles achetés** : libellé + quantité,
  pastille de **rayon** + **icône produit**, et éventuellement la puce de provenance.

### Actions sur un relevé
- ⭐ **Favori** (toggle) : épingle le relevé en tête **et** l'exempte de la suppression automatique.
- ✏️ **Renommer** : donner un nom au relevé (surtout utile pour les favoris, ex. « Grosses courses
  de fête », « Le plein du mois »). Conçois l'état d'édition du nom (inline ou petit champ).
- 🗑️ **Supprimer** le relevé (avec confirmation / undo léger, cohérent avec le reste).
- ✏️ **Éditer le contenu** : pouvoir corriger la quantité/unité d'un article du relevé, ou retirer
  un article. (Édition « adaptable » du relevé.)
- 🔁 **Reconduire** : ré-utiliser une liste passée. Ouvre une **modale de sélection** où **tous les
  articles sont cochés par défaut** ; l'utilisateur **décoche** ce qu'il ne veut pas reprendre cette
  fois, puis confirme → les articles cochés sont **ré-ajoutés à la liste de courses actuelle**.
  Conçois cette modale de reconduction (titre, liste cochable, bouton « Ajouter à ma liste »).

### Suppression automatique (à communiquer subtilement)
Les relevés de **plus d'un mois** sont supprimés automatiquement, **sauf les favoris**. Prévois une
**mention discrète** quelque part (ex. petite note de bas de liste : « Les courses de plus d'un mois
sont effacées automatiquement — épingle ⭐ celles à garder. »).

### État vide
Aucun relevé encore (l'utilisateur n'a jamais validé de courses) : message encourageant expliquant
que l'historique se remplira après son premier « J'ai fait mes courses ».

### (Plus tard, à prévoir visuellement mais pas à détailler)
Un onglet **« Statistiques »** viendra s'ajouter à l'historique (fréquence de rachat d'un produit,
taille moyenne du panier, poids par rayon…). Laisse de la place pour un sélecteur Historique /
Statistiques en tête d'écran, sans le concevoir en détail.

---

## États à produire (desktop ET mobile)
1. Liste de courses — ligne **fusionnée multi-provenances** (Partie A.1) + édition qté en ligne.
2. Modale **« Ajouter un rayon »** (rayons existants + créer un perso + anti-doublon).
3. Bouton **« Ajouter les ingrédients manquants »** sur le détail recette (+ message de confirmation).
4. **Historique** — liste paginée (favoris en tête + chronologique), relevé replié (date + nb + ⭐ + nom).
5. **Historique** — relevé **déplié** (articles : libellé, quantité, rayon, icône).
6. **Reconduction** — modale de sélection (articles cochables).
7. **Renommer** + **éditer** un relevé (états d'édition).
8. Historique **vide**.

## Copies / ton (français)
- Garder le vocabulaire simple et chaleureux (« relevé », « course passée », « reconduire », « favori »).
- Éviter le jargon technique.

## Livrable
- Maquettes haute-fidélité **desktop + mobile** pour les états ci-dessus (prioritaires : 1, 2, 4, 5, 6).
- Export exploitable aux tokens du design system (cohérent avec le handoff Courses existant), +
  icônes **Lucide** retenues par action/rayon.
