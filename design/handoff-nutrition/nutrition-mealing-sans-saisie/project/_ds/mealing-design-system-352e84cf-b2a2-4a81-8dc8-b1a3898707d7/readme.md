# Mealing — Design System

Mealing is a **household meal-planning PWA** (Next.js + Tailwind v4): plan the week's
meals, track nutrition, keep an inventory of what's in the kitchen, auto-build the
shopping list, and reduce food waste — all shared across the members of a household.
An agentic AI assistant can propose actions (add a meal, generate a recipe, update
stock) that the user confirms.

This design system encodes Mealing's visual identity, tokens, components, and
high-fidelity screen recreations so any agent can produce on-brand interfaces.

> **Language:** the product UI is **in French**. Specimens and component copy are
> written in French; this README is in English for the design team.

---

## Sources

- **`uploads/design-direction.md`** — the source of truth. Palette, semantic roles,
  typography, radii/shadows, and the full screen + component inventory. When in doubt,
  follow that document. Token hexes here mirror its Tailwind v4 `@theme` names 1:1.
- No codebase, Figma, or screenshots were provided — the system is built fresh from
  the written direction. The product itself is Next.js + Tailwind v4 (not attached).

---

## Brand in one line

Pastel, warm, "home-cooking", hand-drawn. A soft faded base (paper, sage, butter,
clay) for calm; **rare vivid accents** (green / yellow / orange / red) reserved for
*points of interest only* — primary action, consume-soon, deviations, delete. If
everything is vivid, nothing stands out. **Discipline is the system.**

---

## CONTENT FUNDAMENTALS

**Language & voice.** French, informal **tutoiement** ("Ajoute tes recettes",
"Qu'est-ce qu'on mange ?"). Warm, encouraging, household-friendly — never corporate.
The product speaks *with* the household, not at the user.

**Tone.** Calm and practical with a light, homey warmth. Short, action-led sentences.
Avoids jargon. A pinch of personality in titles and empty states (the handwritten
Caveat moments) — but functional copy stays plain and clear.

**Casing.** Sentence case everywhere — buttons, headings, labels ("Nouvelle recette",
"À consommer en priorité"). No ALL-CAPS except tiny eyebrows/section kickers. French
spacing conventions (e.g. narrow space before `?` `!` `:`).

**Person.** Second person *tu* for instructions to the user; first-person plural *on*
for shared/household framing ("Qu'est-ce qu'on mange ?").

**Numbers & units.** Metric, French formatting (`12 g`, `1,5 L`, `350 kcal`). Dates in
French (lun. mar. mer. …). Tabular figures for nutrition tables.

**Emoji.** Not used. Personality comes from the hand-drawn illustration style and the
Caveat accent font, not emoji.

**Examples.**
- CTA: "Ajouter au planning" · "Générer avec l'IA" · "Confirmer"
- Empty state: "Rien de prévu cette semaine — on s'y met ?"
- Waste alert: "À consommer avant demain"
- Handwritten flourish: "fait maison !" · "rien ne se perd"

---

## VISUAL FOUNDATIONS

**Color.** Warm cream paper (`#FBF7EF`) as the app ground — never pure white. Ink is a
warm near-black (`#34322C`), never `#000`. The *muted base* (sage / butter / clay +
tints) carries the ambience and does the heavy lifting for fills, headers, tags. The
*vivid accents* are signal-only and rare. For text on color, always use the `-strong`
variants (`green-strong`, `red-strong`) to hold AA contrast; the bright `green`/
`yellow` are for fills, icons, and borders, not fine text on white.

**Type.** Three families. **Fraunces** (organic serif) for headings & screen titles —
soft, a touch hand-made, tight tracking (`-0.01em`) at large sizes. **Nunito** (rounded
sans) for all body & UI — 16px baseline, generous 1.55 leading. **Caveat** (handwriting)
strictly for playful labels — screen titles, empty states — never paragraphs.

**Spacing.** 4px base; scale 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Lots of air; cards
breathe. Default card padding 20–24px, section gaps 24–32px.

**Backgrounds.** Flat warm cream — **no gradients**, no bluish-purple anything. Optional
*very* subtle paper grain in the future. Section backgrounds use the muted tints
(`sage-tint`, `butter-tint`, `clay-tint`) as soft fills. Imagery, when present, is warm
home-cooking photography or pastel doodle line-art (line + translucent flat fills, like
a recipe sketched in a notebook).

**Corners.** Pebble-soft. Buttons/inputs ≈12px (`--radius-md`), cards ≈16px
(`--radius-lg`), large sheets 24px, badges & toggles pill. Nothing sharp.

**Shadows.** Low and warm — `ink` at very low alpha (`--shadow-sm/md/lg`). Never hard,
never gray-blue. Elevation is gentle; most surfaces sit on a 1px `--color-line` border
rather than a heavy shadow.

**Borders.** 1px `--color-line` (`#E7E0D2`), soft and sketch-like. Key moments may use a
slightly irregular SVG "sketch" border — reserved for hero cards so it doesn't get
noisy.

**Motion.** Sober. 150–200ms ease transitions on hover, card appearance, and checks.
Micro-feedback on ticking a shopping item and on confirming an AI action. No bounces,
no parallax, no infinite loops.

**Hover / press.** Hover: gentle tint/darken (~6–8%) or a soft `--shadow-md` lift.
Press: slight darken of the fill (use the `-strong` step) and an optional 1px settle —
no aggressive scale. Focus: green focus ring (`--focus-ring`, green @ 40%).

**Transparency & blur.** Used sparingly — translucent pastel fills in illustrations;
the occasional scrim behind a modal. No heavy glassmorphism.

**Cards.** Surface `#FFFDFA`, 1px `--color-line`, `--radius-lg`, `--shadow-sm`. Hover
lifts to `--shadow-md`. Generous interior padding; titles in Fraunces, content in Nunito.

---

## ICONOGRAPHY

- **Style brief:** monoline outline, round corners, ~1.75px stroke, slight hand-drawn
  imperfection.
- **Current set:** **Lucide** (loaded from CDN, pinned `0.460.0`), rendered at
  `stroke-width: 1.75` with round caps/joins — the closest available match to the brief.
  ⚠️ **Substitution flagged:** Lucide is clean rather than truly irregular; a bespoke
  hand-drawn set could be layered in later, or Lucide paths roughened. See
  `guidelines/iconography.card.html`.
- **Doodle illustrations:** pastel line-art for empty states, onboarding, and the
  assistant header — vegetables, pot, basket, notebook. (To be authored as components /
  assets; not yet drawn.)
- **Emoji / unicode as icons:** not used.
- **Logo & symbols:** custom hand-drawn SVGs live in `assets/logo/` (see below).

---

## LOGO

Three directions in `guidelines/logo.card.html` (custom-made — no prior logo existed):

- **A — Wordmark.** "Mealing" set in Fraunces 600 with a small hand-drawn leaf doodle
  over the final letter. Friendly, editorial.
- **B — Bowl & sprout.** A hand-drawn bowl with a two-leaf sprout + faint steam, sage +
  vivid-green. Primary recommendation — evokes cooking + freshness. (`symbol-bowl.svg`)
- **C — Fork-leaf.** A fork whose handle sprouts a leaf. (`symbol-fork-leaf.svg`)

Variants provided: full color, monochrome (`symbol-bowl-mono.svg`, uses `currentColor`),
and a rounded **app icon / favicon** on sage-tint (`app-icon.svg`).

> **Needs your input:** pick a direction (B recommended) so I can lock the lockup,
> spacing, and clear-space rules, and produce final favicon/PWA icon exports.

---

## Index / manifest

**Root**
- `styles.css` — global entry point (consumers link this); `@import` manifest only.
- `readme.md` — this file. · `SKILL.md` — portable Agent-Skill wrapper.

**`tokens/`** — `fonts.css` (Fraunces / Nunito / Caveat via Google Fonts), `colors.css`,
`typography.css`, `spacing.css`, `effects.css` (radii + shadows).

**`assets/logo/`** — `symbol-bowl.svg`, `symbol-bowl-mono.svg`, `symbol-fork-leaf.svg`,
`app-icon.svg`.

**`guidelines/`** — foundation specimen cards (Design System tab):
Colors (neutrals, muted, accents, semantic) · Type (display, body, hand, scale) ·
Spacing (scale, radii, shadows) · Brand (logo, iconography).

**Components & UI kits** — *not yet built.* Pending sign-off on foundations + logo,
then: component library (buttons, fields, cards, badges, list rows, nav, nutrition
table, assistant bubbles, empty states) and high-fidelity screens (Planning, Stock +
anti-waste, Assistant first).

---

## Caveats

- **Fonts load from Google Fonts CDN** (Fraunces, Nunito, Caveat — no substitution
  needed). For fully self-hosted/offline use, drop the binaries into `assets/fonts/`
  and swap the `@import` in `tokens/fonts.css` for `@font-face` rules.
- **Icons are Lucide** (substitution flagged above).
- **Logo is newly designed** and awaiting your pick of direction.
- **Doodle illustrations** for empty states are described but not yet drawn.
