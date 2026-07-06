# Brief Claude Design — Refonte HAUTE-FIDÉLITÉ de la section « Nutrition » (Mealing)

> À coller dans Claude Design. Objectif : transformer la section Nutrition — aujourd'hui un simple
> **tableau de chiffres sans usage** — en **« copilote nutrition du foyer »** : on voit sans saisir,
> on comprend en 5 secondes, on peut agir. Ce n'est PAS un ravalement : la logique produit a été
> entièrement repensée (suivis personnalisés par facettes + suivis d'habitudes) et il faut lui
> donner sa forme. Desktop + mobile, **mobile prioritaire** (PWA installée, usage quotidien).

---

## Contexte produit

Mealing est une PWA familiale de gestion des repas, tout-intégrée : **planning de repas + recettes
+ stock + péremption + liste de courses + foyer partagé + assistant IA**. Ton chaleureux, simple,
rassurant. Particularité décisive de la section Nutrition : chez tous les concurrents, la nutrition
exige de la saisie (logger chaque repas — cause n°1 d'abandon du marché). Chez Mealing, **la
nutrition découle automatiquement du planning** : un repas planifié est considéré mangé tel que
prévu, sans action. **Zéro saisie, jamais.** C'est la promesse à incarner visuellement.

Tu redessines **uniquement la section Nutrition**, en parfaite cohérence avec les écrans déjà
conçus (Planning en vue agenda, Recettes en grille de cartes, Courses, Stock, Assistant).

### Principes directeurs à respecter (importants)
- **Zéro saisie** : aucune interaction quotidienne n'est requise. Les chiffres se remplissent seuls
  depuis le planning. L'utilisateur ne « logge » JAMAIS un repas ici.
- **Bienveillance, pas de tribunal** : jamais de rouge punitif quotidien, jamais de binaire
  réussi/raté. L'unité de jugement est la **semaine** (un excès ponctuel se lisse). Langage positif.
- **Honnêteté assumée** : les chiffres sont des estimations. On affiche la **couverture des
  données** (« semaine couverte à 80 % ») plutôt qu'une fausse précision.
- **Mention visible quelque part** : « Ceci n'est pas un avis médical. » Ton bien-être, jamais
  médical ni prescriptif.
- **Vie privée** : le suivi nutritionnel est strictement personnel — invisible pour le reste du
  foyer par défaut. À rappeler dans les moments de confiance (onboarding).

## Design system (à réutiliser, NE PAS réinventer)
- **Couleurs** : fond crème/papier, **vert sauge** primaire, accents **terracotta/argile** (clay) et
  **beurre** (butter). Teintes douces. **Pas de dark mode**.
- **Polices** : **Fraunces** (titres), **Nunito** (texte courant), **Caveat** (accent manuscrit).
- **Formes** : coins très arrondis (`rounded-2xl`), ombres douces (`shadow-soft`), primitives
  `btn-primary/secondary/danger`, `card`, `field-input`, pastilles/badges arrondis.
- **Icônes Lucide** (cohérentes par action). Cibles tactiles ≥ 44 px, contrastes AA.

---

## ⚠️ LA LOGIQUE CENTRALE À INCARNER — le suivi personnalisé qui s'explique

L'utilisateur ne choisit PAS un « persona » figé. Il coche des **facettes** (multi-sélection) et
reçoit des **recommandations de suivi qui s'expliquent** — puis garde la main sur tout.

```
FACETTES (chips : activités / alimentation / objectifs — tout optionnel)
   ↓
RECOMMANDATIONS EXPLIQUÉES (3 à 6 cartes max, chacune avec son « pourquoi »)
   ↓
PLAN DE SUIVI PERSONNEL (chaque suivi : activable, réglable, retirable)
```

**Exemple de carte de recommandation (le format clé à designer)** :

> **Sources de collagène** · 1×/semaine
> *Recommandé parce que tu as coché **course à pied** + **articulations**.*
> Les sports à impact sollicitent tendons et cartilages ; certains sportifs veillent à leurs
> apports en sources de collagène (bouillons, plats mijotés gélatineux…).
> [ Suivre ✓ ] [ Non merci ]

**Deux familles de cartes de suivi** (la typologie est INVISIBLE pour l'utilisateur — il voit
juste des cartes, certaines avec une jauge, d'autres avec des coches) :

1. **Suivi chiffré** : jauge vers une **zone cible min–max** (pas une barre 0→max punitive).
   Ex. Protéines : planifié 96 g / réel estimé 96 g / zone ≥ 120 g. La jauge montre planifié ET
   réel sur la même échelle, avec la zone cible en fond. Certains suivis n'ont **pas de cible**
   (« mode observation » : juste la valeur et sa tendance) ou une **« cible personnelle »**
   (badge discret : valeur donnée par un médecin/coach, pas par l'app).
2. **Suivi d'habitude** : compteur d'occurrences vers un repère. Ex. « **Poisson gras 2/2 cette
   semaine ✓ · dont 1 à venir** » (compté depuis les repas planifiés ; « à venir » = repas planifié
   pas encore passé — la nuance évite de croire à un bug). Peut être un minimum (« légumineuses
   2×/sem ») OU une limite (« viande rouge ≤ 2×/sem »). Formats des repères officiels français.

**Chaque suivi porte son indicateur d'honnêteté** : « couvert à 60 % » (part des ingrédients de la
semaine dont la donnée est connue) — discret, mais présent.

---

## La page Nutrition = machine à 3 ÉTATS (à designer chacun)

1. **Pas encore activé** → HERO d'activation : la promesse (« Ta nutrition, déduite de ton planning.
   Zéro saisie. »), 2-3 bénéfices, CTA « Activer mon suivi ». JAMAIS de tableaux de zéros en premier
   contact. Rappel vie privée (« invisible pour ton foyer »).
2. **Activé mais pas de repas planifiés** → invitation chaleureuse : « Planifie tes repas — tes
   repères se rempliront tout seuls » + CTA vers le Planning.
3. **Activé + planning rempli** → l'écran réel (le cœur du design, voir ci-dessous).

### L'écran principal (état 3)
- Bascule **Jour / Semaine** (la semaine est l'unité de bienveillance — c'est la vue par défaut
  suggérée ; le jour est le zoom).
- **Les cartes de suivi** de l'utilisateur (jauges + habitudes mélangées, ordre logique) —
  planifié vs réel estimé vs zone.
- **Score hebdo bienveillant** : « Dans la zone 5 jours sur 7 » (ou équivalent visuel doux) —
  jamais une note sur 100 anxiogène.
- **Tendances** : mini-graphes (semaine/mois) par suivi ou globaux — sobres.
- **Top contributeurs** (secondaire, dépliable) : « d'où viennent tes protéines » — les 3 recettes
  de la semaine qui contribuent le plus à un nutriment.
- **Carte « couverture des données »** : « Semaine couverte à 80 % (12/13 ingrédients avec
  données) » + bouton « Compléter les données » quand < 100 %.
- Accès : bouton **« Gérer mes suivis »** + entrée discrète vers l'assistant IA.

---

## Onboarding — 2 écrans, ~90 secondes (à designer)

- **Écran A « Parle-nous de toi »** : 3 groupes de chips multi-sélection sur UNE page —
  *Activités* (muscu/force · course & impact · endurance · études/travail intellectuel · métier
  physique · plutôt sédentaire · souvent fatigué·e), *Alimentation* (végétarien · végan · peu de
  poisson · peu de laitages), *Ce qui compte pour toi* (équilibre · perte de poids douce ·
  muscle/perf · articulations · mémoire & concentration · énergie · immunité · vieillir en forme).
  Tout optionnel, skippable. **Dépliant optionnel « Affiner mes repères »** : année de naissance,
  sexe, poids, taille, niveau d'activité — avec note vie privée (jamais partagé, même au foyer).
- **Écran B « Ton plan de suivi »** : les 3-6 cartes recommandées avec leur pourquoi (format
  ci-dessus), pré-cochées, cibles modifiables (champs min–max) → « C'est parti ».
- **Fin d'onboarding** : si la couverture des données est faible, l'écran de succès enchaîne :
  « Ta semaine est couverte à 40 % → [Compléter les données] » (une seule cérémonie).

## « Mes suivis » — LA surface de gestion unique (à designer)

Une seule porte pour tout gérer, 2 onglets :
- **Onglet Suivis** : les cartes actives (toggle, cible modifiable, retirer) + en dessous le
  **catalogue cherchable** de tous les suivis possibles (chacun avec son explication + source,
  badge « recommandé pour toi » sur ceux que le moteur suggère). Recherche sans résultat →
  proposition « Demande à l'assistant ».
- **Onglet Profil** : les chips de facettes re-modifiables (→ les recommandations se recalculent)
  + infos corporelles.
- **Constructeur d'habitude personnalisée** (accessible depuis le catalogue : « Créer mon propre
  repère ») : direction (au moins / au plus) × N fois × par jour/semaine × ce qui compte
  (groupes d'aliments proposés OU sélection libre d'aliments). Ex. « Fermentés ≥ 3×/semaine ».
  Doit rester simple : 3-4 choix, pas un formulaire d'ingénieur.

## Mode ENFANT (éthique, non négociable — à designer)

Un profil enfant ne voit **JAMAIS de calories ni de chiffres anxiogènes**. Sa page = variété et
équilibre, langage positif et ludique SOBRE : « 4 légumes différents cette semaine 🎉 », coches de
découvertes, jamais de rouge, jamais de « raté ». Sous-titre type : « Variété et équilibre au fil
des repas — sans comptage. » Montre à quoi ressemble sa page principale (état 3) et sa carte
d'habitude phare (variété de légumes).

---

## États à produire (desktop ET mobile)

1. **Hero d'activation** (état 1) — desktop + mobile.
2. **Onboarding écran A** (chips + dépliant infos corporelles) — mobile prioritaire.
3. **Onboarding écran B** (plan de suivi, cartes « pourquoi ») + fin avec couverture.
4. **Page principale remplie** (état 3) — vue Semaine ET vue Jour, avec : jauges vers zone,
   habitudes (« 2/2 dont 1 à venir »), score hebdo, couverture 80 %, un suivi en mode observation,
   un suivi à cible personnelle (badge). Desktop + mobile.
5. **« Mes suivis »** — les 2 onglets + le catalogue cherchable.
6. **Constructeur d'habitude personnalisée** — l'interaction complète.
7. **Mode enfant** — page principale.
8. **État « activé sans planning »** (état 2) — peut être compact.

## Copies / ton (français)

- Sous-titre possible de la section : *« Ta nutrition, déduite de ton planning. Zéro saisie. »*
- Registre bien-être, jamais médical : « repère », « zone », « veiller à », « certains sportifs… »
  — jamais « carence », « déficit », « prescription ». Mention « Ceci n'est pas un avis médical ».
- Éviter le jargon technique : ne JAMAIS écrire « quantitatif / habitude / facette / persona » —
  l'utilisateur voit « mes suivis », « mes repères », « mon profil ».

## Livrable attendu

- Maquettes **haute-fidélité desktop + mobile** des états 1 à 8 (au minimum 1, 3, 4, 5, 7 ;
  mobile prioritaire).
- Le **format de carte de suivi** (jauge vers zone + habitude à coches) clairement spécifié —
  c'est le composant central, il doit être déclinable.
- Export exploitable pour l'implémentation (HTML/CSS aux **tokens du design system**, dans un
  handoff `design/`), cohérent avec les écrans existants.
- Indiquer les **icônes Lucide** retenues (par groupe de facettes, par type de suivi, par action)
  et le traitement couleur des états de jauge (sous la zone / dans la zone / au-dessus) —
  rappel : jamais de rouge punitif ; « au-dessus » se signale en douceur (terracotta).
