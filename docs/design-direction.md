# Mealing — Direction visuelle, inventaire & design tokens

Document destiné à amorcer le design system Claude Design et à guider l'implémentation
front-end (Next.js + Tailwind v4). Voir [CLAUDE.md](../CLAUDE.md) pour le contexte produit.

---

## 1. Direction artistique

**Ambiance** : pastel, chaleureuse, « cuisine de maison », trait dessiné à la main. On veut
une base douce et fanée (papier, sauge, beurre) et des **accents vifs ponctuels** pour faire
ressortir uniquement les éléments d'intérêt (actions principales, alertes, points à regarder).

Principes :
- **Fond papier** légèrement crème plutôt que blanc pur → cohérent avec le trait manuel.
- **Base fanée (muted)** : sauge, jaune beurre, touches pêche/terracotta. C'est le « calme ».
- **Accents vifs (rares)** : vert vif, jaune, orange, rouge — uniquement pour signaler
  (CTA, à consommer, écart, supprimer). Si tout est vif, plus rien ne ressort : discipline.
- **Trait dessiné main** : icônes en contour légèrement irrégulier, petites illustrations
  « doodle » (légumes, ustensiles) pour les états vides, bordures douces. Grain de papier
  très subtil en fond (optionnel).
- **Formes** : coins bien arrondis, ombres basses et chaudes (jamais dures), beaucoup d'air.

Complément que je propose (cohérent avec le brief) :
- **Terracotta/argile fanée** comme couleur de liaison chaude (badges secondaires, illus).
- **Une seule famille d'accent froid très discrète** (sauge profonde) pour l'info, afin de ne
  pas casser l'harmonie chaude — pas de bleu.
- Style d'illustration : *line art* monoligne + aplats pastel translucides, comme une recette
  croquée dans un carnet.

---

## 2. Palette

### Neutres (papier & encre)
| Token | Hex | Usage |
|---|---|---|
| `--color-paper` | `#FBF7EF` | Fond de l'app |
| `--color-surface` | `#FFFDFA` | Cartes, panneaux |
| `--color-line` | `#E7E0D2` | Bordures (effet croquis doux) |
| `--color-ink` | `#34322C` | Texte principal (noir chaud, pas pur) |
| `--color-ink-soft` | `#6F6B61` | Texte secondaire, légendes |

### Base fanée (pastel — l'ambiance)
| Token | Hex | Usage |
|---|---|---|
| `--color-sage` | `#9CBE96` | Vert fané — couleur de marque douce |
| `--color-sage-tint` | `#DCE8D4` | Aplats, fonds de section, tags neutres |
| `--color-butter` | `#E9DFA3` | Jaune fané |
| `--color-butter-tint` | `#F5EFCF` | Surbrillance douce, fonds |
| `--color-clay` | `#D9A98C` | Terracotta fanée — chaleur, badges secondaires |
| `--color-clay-tint` | `#F0DDD0` | Fond doux chaud |

### Accents vifs (les éléments d'intérêt — usage rare)
| Token | Hex | Usage |
|---|---|---|
| `--color-green` | `#45A35E` | Vert vif — frais, validé, succès |
| `--color-green-strong` | `#2F8049` | Vert vif pour **texte sur fond** / boutons (contraste AA) |
| `--color-yellow` | `#F4C430` | Jaune vif — mise en avant, surbrillance |
| `--color-orange` | `#EF8A3C` | Orange — attention (à consommer bientôt) |
| `--color-red` | `#DD5240` | Rouge — danger, périmé, suppression |
| `--color-red-strong` | `#C23E2E` | Rouge pour **texte sur fond** / boutons (contraste AA) |

### Rôles sémantiques
| Rôle | Couleur | Notes |
|---|---|---|
| Action principale (CTA) | `--color-green-strong` (fond) / blanc (texte) | remplace les boutons noirs actuels |
| Action secondaire | contour `--color-sage` sur `--color-surface` | |
| Action destructive | `--color-red-strong` | ✕ supprimer, repas sauté |
| Succès / frais / présent / partagé | `--color-green` | |
| Avertissement / péremption proche | `--color-orange` | badge « à consommer » |
| Danger / périmé | `--color-red` | badge périmé, dépassé |
| Surbrillance / focus d'intérêt | `--color-yellow` | à doser très finement |
| Marque / ambiance | `--color-sage`, `--color-butter`, `--color-clay` | fonds, en-têtes, illus |

**Accessibilité** : sur fonds pastel clairs, toujours écrire en `--color-ink`. Les accents vifs
clairs (jaune, vert `#45A35E`) ne passent pas l'AA en texte fin sur blanc → réservés aux
aplats/icônes/bordures ; pour le texte sur fond coloré, utiliser les variantes `*-strong`.

---

## 3. Typographie

- **Titres** : `Fraunces` (serif organique, doux, un brin « fait main »).
- **Corps / UI** : `Nunito` (sans rond, chaleureux, très lisible).
- **Accent manuscrit (optionnel, parcimonieux)** : `Caveat` ou `Patrick Hand` — uniquement pour
  des labels ludiques (titres d'écran, état vide), jamais pour du texte long.

Échelle (rem) : `xs .75` · `sm .875` · `base 1` · `lg 1.125` · `xl 1.25` · `2xl 1.5` · `3xl 1.875`.
Corps en 16px, interlignage généreux (1.5–1.6).

---

## 4. Forme, espace, profondeur

- **Rayon** : `--radius-sm 8px` · `--radius-md 12px` · `--radius-lg 16px` · `--radius-xl 24px` ·
  boutons/inputs ≈ 12px, cartes ≈ 16px. Aspect « galet » doux.
- **Espacement** (base 4px) : 4, 8, 12, 16, 24, 32, 48, 64.
- **Ombres** (basses, chaudes) : `--shadow-sm 0 1px 2px rgba(52,50,44,.06)` ·
  `--shadow-md 0 4px 12px rgba(52,50,44,.08)`. Pas d'ombre dure.
- **Bordures** : 1px `--color-line`, éventuellement un style « croquis » sur les cartes clés
  (bordure SVG légèrement irrégulière) — à réserver aux moments forts pour ne pas alourdir.

---

## 5. Iconographie & illustration

- Icônes : contour monoligne, coins ronds, ~1.75px, légère imperfection (style dessiné main).
- Illustrations « doodle » pastel pour : états vides (planning vide, stock vide, pas de recette),
  onboarding, en-tête de l'assistant. Motifs : légumes, marmite, panier, carnet.
- Le badge anti-gaspi peut s'accompagner d'une petite icône (sablier/feuille) selon l'urgence.

---

## 6. Motion (sobre)
- Transitions douces 150–200ms (hover, apparition de carte, coche).
- Micro-feedback à la coche d'un article de courses et à la confirmation d'une action IA.

---

## 7. Inventaire des écrans

| Écran | Route | Éléments clés / où placer les accents |
|---|---|---|
| Connexion / inscription | `/login` | carte centrée papier, CTA vert, lien bascule |
| Onboarding foyer | `/onboarding` | illustration d'accueil, champ nom de foyer, CTA vert |
| Acceptation d'invitation | `/invitations/accept` | message + CTA « Rejoindre » |
| Shell applicatif | layout `(app)` | barre de nav (7 entrées), profil, déconnexion |
| Planning | `/planning` | 7 cartes-jour, badges créneau, repas, « hors-plan » (orange), écart sauté (rouge)/différent (orange) |
| Recettes (liste) | `/recettes` | lignes recette, CTA « Nouvelle » (vert) + « Générer IA » (secondaire) |
| Nouvelle recette | `/recettes/nouvelle` | formulaire, lignes d'ingrédients dynamiques |
| Détail recette | `/recettes/[id]` | tableau nutrition par portion, tags, étapes |
| Génération IA | `/recettes/generer` | prompt, **aperçu** du brouillon, CTA enregistrer |
| Stock + anti-gaspi | `/stock` | section « À consommer en priorité » (orange/rouge), badges péremption, sélecteur de conservation |
| Liste de courses | `/courses` | 3 groupes, cases à cocher, ajout manuel, récurrents |
| Nutrition | `/nutrition` | tableaux jour/semaine (planifié/réel/objectif), édition objectifs ; dépassement en rouge |
| Foyer | `/foyer` | membres, toggle partage nutrition (vert), invitation + liens |
| Assistant (agentique) | `/assistant` | bulles user/assistant, **carte de confirmation** (orange) avec Confirmer (vert)/Annuler |

---

## 8. Inventaire des composants (bibliothèque du design system)

Groupes proposés pour le Design System pane (`@dsCard group="…"`) :

- **Fondations** : couleurs, typographie, espacement, rayons/ombres, icônes.
- **Boutons** : primaire (vert), secondaire (contour sauge), destructif (rouge), lien inline, tailles.
- **Champs** : input texte, number, textarea, select, label, message d'erreur.
- **Cartes & sections** : panneau bordé, carte-jour planning, carte recette, carte d'aperçu IA.
- **Badges & puces** : créneau (petit-déj/déj/dîner/collation), tag recette, **badge péremption**
  (frais/à consommer/périmé), statut consommation (conforme/sauté/différent).
- **Listes & lignes** : ligne stock (avec décrément/présence), ligne de courses (case + barré),
  ligne membre du foyer, ligne ingrédient.
- **Navigation** : barre de nav (desktop + mobile), lien actif.
- **Tableaux** : tableau nutrition (planifié/réel/objectif, dépassement coloré).
- **Assistant** : bulle utilisateur, bulle assistant, **carte de proposition à confirmer**.
- **États** : état vide (illustration + message), chargement, toast/confirmation.

---

## 9. Tokens — extrait prêt pour Tailwind v4 (`@theme`)

À placer dans `globals.css` lors de l'implémentation (Phase 4) :

```css
@theme {
  --color-paper: #FBF7EF;
  --color-surface: #FFFDFA;
  --color-line: #E7E0D2;
  --color-ink: #34322C;
  --color-ink-soft: #6F6B61;

  --color-sage: #9CBE96;
  --color-sage-tint: #DCE8D4;
  --color-butter: #E9DFA3;
  --color-butter-tint: #F5EFCF;
  --color-clay: #D9A98C;
  --color-clay-tint: #F0DDD0;

  --color-green: #45A35E;
  --color-green-strong: #2F8049;
  --color-yellow: #F4C430;
  --color-orange: #EF8A3C;
  --color-red: #DD5240;
  --color-red-strong: #C23E2E;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  --font-display: "Fraunces", serif;
  --font-sans: "Nunito", ui-sans-serif, system-ui, sans-serif;
  --font-hand: "Caveat", cursive;
}
```

---

## 10. Ce qui suit
1. Toi : créer le design system Mealing dans claude.ai/design (uploader le repo + ce document + un logo si dispo), le définir « Default ».
2. Moi : construire la **bibliothèque de composants HTML locale** (groupes ci-dessus, avec marqueurs `@dsCard`) et la pousser via `/design-sync`.
3. Toi : générer les **maquettes haute-fidélité** écran par écran (mode High Fidelity).
4. Moi : **handoff → implémentation** (tokens, composants, refonte écran par écran) sans toucher au back-end.
