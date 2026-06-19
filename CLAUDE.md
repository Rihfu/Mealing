# CLAUDE.md — Mealing (mémoire de travail)

Document de référence définitif : [specifications-projet.md](./specifications-projet.md)
Ce fichier est un résumé opérationnel. En cas de doute sur un détail, lire le document source.

---

## Règle de travail fondamentale

**Toute proposition de nouvelle fonctionnalité ou tout écart par rapport aux specs doit être soumis et validé avant implémentation.** Rien n'est ajouté silencieusement.

---

## Principes directeurs non-négociables

1. **Confirmation par défaut.** Un repas planifié = mangé tel que prévu, sans action utilisateur. On ne demande jamais de validation positive systématique.
2. **Précision approximative assumée.** Nutrition, péremption, stock — viser l'exactitude parfaite serait un gouffre de temps pour un gain illusoire.
3. **L'IA n'invente jamais une donnée vérifiable.** Le calcul nutritionnel vient toujours d'une base de données, jamais d'un LLM.
4. **Backend en fonctions réutilisables dès la Phase 0.** Pas de logique éparpillée dans l'interface — condition nécessaire pour l'assistant agentique futur.
5. **Tout fournisseur externe est isolé dans une couche d'abstraction.** Changer de fournisseur IA ou nutritionnel = ajustement mineur, pas réécriture.
6. **Aucune fonctionnalité critique ne dépend d'un appareil personnel devant rester allumé.**
7. **Toute extension de périmètre est nommée et chiffrée explicitement**, jamais absorbée silencieusement.
8. **Toute donnée appelée à s'enrichir progressivement utilise une structure extensible** (table de référence + table de valeurs), jamais des colonnes fixes codées en dur.

---

## Architecture technique retenue

| Composant | Choix |
|---|---|
| Frontend | PWA React / Next.js |
| Backend / BDD | Supabase (PostgreSQL + Auth + RLS + Storage) |
| Hébergement frontend | Vercel ou Netlify (gratuit) |
| Données nutritionnelles — ingrédients bruts | USDA FoodData Central (API gratuite) |
| Données nutritionnelles — produits emballés | Open Food Facts (API gratuite, scan code-barres) |
| Données de conservation | USDA FoodKeeper (table de référence curatée manuellement) |
| IA | **API cloud à palier gratuit : Groq ou Gemini** |
| Authentification | Supabase Auth |

### Versions réellement installées (vérifier les guides, ne pas se fier à la mémoire d'entraînement)

- **Next.js 16.2.x** (App Router) + **React 19** + **Tailwind v4** + TypeScript. Postérieur à mon cutoff d'entraînement.
- **Avant d'écrire du code Next.js, lire le guide concerné dans `node_modules/next/dist/docs/`** (consigne du `AGENTS.md` généré par le scaffold).
- Pièges Next 16 déjà identifiés :
  - `cookies()` (`next/headers`) est **async** → `const c = await cookies()`.
  - Le middleware s'appelle désormais **`proxy.ts`** (racine ou `src/`), plus `middleware.ts`. Même rôle.
- Intégration Supabase via `@supabase/ssr` : client navigateur (`createBrowserClient`), client serveur (`createServerClient` + cookies async), refresh de session dans `proxy.ts`.

---

## Décisions explicitement écartées — ne jamais reproposer

- **Calcul nutritionnel par IA** : génère un nombre plausible, pas vérifié — incompatible avec la promesse de fiabilité.
- **Construction d'une base nutritionnelle maison** : plusieurs années-personnes de travail, inutile face aux bases existantes.
- **Apps natives séparées iOS / Android** : rapport effort/bénéfice mauvais pour un développeur solo.
- **Hébergement local de l'IA (Ollama ou mini-serveur)** : crée une dépendance à un appareil personnel allumé en permanence — voir section 8 des specs pour le raisonnement complet.
- **Chiffrement de bout en bout** : incompatible avec l'assistant IA contextuel qui doit lire les données en clair.
- **Publication sur App Store / Play Store** : non nécessaire, usage personnel/familial uniquement.

---

## Séquencement des phases

| Phase | Contenu résumé |
|---|---|
| **0** | Schéma complet + champs réservés, Auth + RLS, intégration USDA / Open Food Facts, recettes manuelles, backend en fonctions réutilisables |
| 1 | Planification de repas + nutrition planifiée/réelle par profil |
| 2 | Stock + liste de courses + partage Foyer (invitation, visibilité, accès concurrents) |
| 3 | Péremption/conservation + suggestions anti-gaspillage |
| 4 | Génération de recettes par IA |
| 5 | Assistant conversationnel IA (lecture seule) |
| 6 | Assistant IA agentique (lecture/écriture) |

**Estimation actuelle Phases 0–2 : 14 à 22 semaines à 10-20h/semaine.**

### État d'avancement

- **Toutes les phases (0 à 6) : faites et mergées dans `main`.** Migrations 0001–0007 appliquées en base, RLS testé, types générés. Aucune branche de feature active — développer depuis `main`, une branche par phase.
  - Phase 0 : fondations (schéma, RLS, fournisseurs, backend réutilisable).
  - Phase 1 : auth + onboarding foyer + shell ; Aliments (import USDA+OFF) ; Recettes (CRUD + nutrition calculée) ; Planning hebdo ; Nutrition (agrégation jour/semaine planifié vs réel, objectifs).
  - Phase 2 : Stock ; Liste de courses dynamique (`generateShoppingList`) ; Partage Foyer (membres, invitation + `/invitations/accept`, visibilité nutrition via `nutrition_share`). Accès concurrents couverts par le RLS.
  - Phase 3 : péremption + anti-gaspillage. Seed `conservation_rule` (0007) ; `getStockWithExpiry` (estimation déterministe triée par péremption, sans IA) ; UI stock.
  - Phase 4 : génération de recettes par IA. Mode JSON sur la couche Groq ; `src/lib/ai/generate-recipe.ts` (prompt + zod) ; UI `/recettes/generer`. Garde-fou n°3 respecté (aucune valeur nutritionnelle générée).
  - Phase 5 : assistant conversationnel IA **lecture seule**. `src/lib/ai/assistant.ts` (contexte repas/stock/macros + historique `conversation_ia`) ; UI `/assistant`. Ne modifie aucune donnée métier.
  - Phase 6 : assistant **agentique**. `src/lib/ai/agent.ts` (askAgent propose / executeAgent exécute via `core/`). **Confirmation systématique** : l'IA propose, l'utilisateur confirme (carte Confirmer/Annuler dans `agent-chat.tsx`), rien n'est écrit avant. Actions additives en liste blanche (add_meal, add_stock_item, add_shopping_item, mark_day_off), validées zod, sous RLS.
- **Périmètre du document entièrement couvert.** Évolutions futures = nouvelles propositions à valider (voir règle de travail en tête).
- Note auth : confirmation email Supabase activée + validation MX des domaines à l'inscription (rejette example.com). Pour tester, créer un user confirmé via SQL.
- Convention UI : les mutations passent par des server actions qui appellent les fonctions de `src/lib/core/` (jamais de logique métier dans les composants).

### Design system (intégré dans `main`)

- **Statut** : fondations + maquettes haute-fidélité **mobile et desktop** intégrées dans `main` (commits `1869bc9`, `84ba912` mobile, `89b7878` desktop). La branche `design-system-foundations` existe encore (origin) mais son contenu est dans `main` — peut être supprimée.
- Handoff Claude Design implémenté : fondations (tokens, polices, logo) **puis écrans restylés en haute-fidélité**. Sources : `design/handoff/`, `design/handoff-desktop/`, `docs/design-direction.md`, `docs/claude-design-brief.md`, `docs/claude-design-highfi-brief.md`, `docs/claude-design-highfi-desktop-brief.md`.
- Tokens `@theme` Tailwind v4 dans `src/app/globals.css` ; polices Fraunces/Nunito/Caveat via `next/font` (layout racine) ; logo `public/logo.svg` + favicon `src/app/icon.svg` (direction « bowl & sprout » B).
- Dark mode OS neutralisé via `@custom-variant dark (&:where(.dark, .dark *))` → les classes `dark:` existantes sont inertes.
- Primitives `@layer components` : `btn-primary/secondary/danger`, `card`, `field-input`, `nav-link`.
- **Piège Tailwind v4** : ne JAMAIS mettre `@import url(...)` (ex. Google Fonts) dans `globals.css` — `@import "tailwindcss"` est développé sur place, ce qui casse `@theme` puis la compilation. Charger les polices via `next/font`.
- Écrans restylés en haute-fidélité (mobile + desktop). **Restent à faire** : icônes **Lucide** (lib non installée, cf. `package.json`) et la passe « composants React partagés ».

### Changements récents non issus du séquencement par phases (Codex, juin 2026)

- **Design haute-fidélité** : maquettes mobile (`84ba912`) puis desktop (`89b7878`) intégrées sur ~19 écrans (planning, nutrition, courses, foyer, recettes, login, onboarding, assistant…).
- **Déploiement Netlify** : `netlify.toml` configuré avec le plugin runtime `@netlify/plugin-nextjs` (`e117fde`) ; clés Supabase publiques exclues du secret-scan Netlify (`cfb965c`, `581c84e`).
- **Recettes IA + stock** (`11c0f6c`) : la génération de recettes par IA tient désormais compte du stock disponible (`src/lib/ai/generate-recipe.ts`, `src/lib/core/shopping.ts`, flow `recettes/generer`).

### Refonte de la section Courses / Liste de courses (juin 2026 — mergée dans `main`, merge `804d93d`)

Doc de référence : `docs/courses-ux-refonte.md` · tests/bugs : `docs/courses-retravail-findings.md` · maquettes Claude Design : `design/handoff-courses/` · brief : `docs/claude-design-courses-brief.md`.

- **Logique** : réconciliation d'unités (`src/lib/units.ts` — `UNIT_OPTIONS`, `toBase/fromBase`, source unique), `src/lib/core/shopping.ts` enrichit chaque ligne de `category` (rayon) + `iconSlug`, calcule la fenêtre via `getShoppingWindow` (cadence foyer), et `checkoutPurchasedToStock` (achat → stock daté, **flux entrant**, ne touche pas à la décrémentation specs 3.4). Catalogue : `src/lib/core/foods.ts` (`searchFoodCatalog` hybride local + USDA/OFF, `importFoodByRef`).
- **UI** (`src/app/(app)/courses/`) : `page.tsx` (liste unique triée par rayon + puces de provenance + « Déjà pris »), `add-article.tsx` (autocomplétion + formats `food_package` + unités + anti-surplus/doublon), `purchase-checkout.tsx` (achat→stock), `undo-toast.tsx` (annulation des suppressions). Banque d'assets d'icônes produits réutilisable : `src/lib/product-assets.tsx`.
- **BDD** : migrations `0008` (catalogue : `food.category`, table `food_package`, `shopping_manual_item.food_id`), `0009` (seed FR : 76 aliments / 8 rayons / 29 conditionnements), `0010` (`household.shopping_horizon_days`). Appliquées en base + types régénérés.
- **Bugs corrigés** : déduction stock sans unités, besoins masqués sur unité ≠, collision de clés d'état.
- **Reste optionnel** : UX-14 (vue « mode magasin » mobile dédiée).

### Déploiement production — EN LIGNE (juin 2026)

- **Live : https://mealings.netlify.app** (Netlify, auto-deploy depuis `main`). Connexion + écrans (Stock, Courses, etc.) fonctionnels.
- Backend : **même** projet Supabase qu'en dev (`wbnyngsngppwlsggkorm`) → migrations 0001-0010 et seed catalogue déjà appliqués, rien à re-migrer.
- Variables d'env Netlify configurées : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GROQ_API_KEY`, `USDA_API_KEY` (+ `SUPABASE_SERVICE_ROLE_KEY` optionnelle).

**Pièges Netlify / Supabase rencontrés (à retenir) :**
- **Supabase Site URL doit inclure `https://`** — sinon le lien de confirmation email redirige vers `…supabase.co/<site>` → « requested path is invalid ». Redirect URL : `https://mealings.netlify.app/auth/callback` (+ `/**`, + `http://localhost:3000/auth/callback`).
- **`GROQ_API_KEY` / `USDA_API_KEY` requises au runtime** (zod dans `env.server.ts`). Si absentes : la page `/login` (publique) s'affiche, mais **toute page de l'app plante en 500** (chaîne `core` → `providers/{nutrition,ai}` → `env.server`). Un changement de variable d'env Netlify n'est pris en compte qu'après un **redeploy**.
- **Emails Supabase intégrés rate-limités** (quelques/heure, test only) → « email rate limit exceeded ». Pour la prod : configurer un **SMTP custom** (Auth → Settings → SMTP). Astuce test : confirmer un compte via SQL (`update auth.users set email_confirmed_at = now() …`).

### Reprise du chantier Courses — amorçage pour une nouvelle session (à froid)

Une nouvelle session n'a **aucune mémoire** de la précédente. Pour reprendre le travail sur la Liste de courses :

**Lire d'abord (tout le contexte développé y est) :**
- `docs/courses-ux-refonte.md` — **document de référence** : inventaire complet des problèmes UX (UX-01→15), étude de marché (apps concurrentes + leurs limites), feuille de route A→H + UX-13/14 avec l'**état de chaque chantier** (fait / à faire), invariants à respecter.
- `docs/courses-retravail-findings.md` — journal des tests + bugs trouvés/corrigés.
- `design/handoff-courses/` — maquettes Claude Design (8 états, desktop + mobile) ; `docs/claude-design-courses-brief.md` — le brief envoyé au design.

**Fichiers clés de la section :**
- `src/lib/core/shopping.ts` — `generateShoppingList` (liste dynamique, chaque ligne porte `category`/`iconSlug`/`foodId`), `getShoppingWindow` (cadence foyer), `checkoutPurchasedToStock` (achat→stock), `remainingAfterStock` (déduction avec unités).
- `src/lib/core/foods.ts` — `searchFoodCatalog` (autocomplétion hybride local+USDA/OFF), `importFoodByRef`.
- `src/lib/units.ts` — **source unique** des unités (UI + conversions). `src/lib/product-assets.tsx` — icônes produits doodle + rayons + provenance (`resolveProduct`).
- `src/app/(app)/courses/` — `page.tsx` (server, rendu liste par rayon), `actions.ts` (server actions → `core/`), `add-article.tsx` / `purchase-checkout.tsx` / `undo-toast.tsx` (composants **client**).

**Conventions à respecter (sinon on casse l'archi) :**
- Mutations via **server actions → fonctions `core/`** ; jamais de logique métier dans les composants.
- Interactivité (autocomplete, modale, toast) = **composants client** ; le reste reste server (RSC).
- Stock : l'achat est un **flux entrant** ; ne JAMAIS décrémenter le stock par les courses/planning (specs 3.4).
- Unités : toujours passer par `src/lib/units.ts`. Catalogue : tables `food` (+ colonne `category` = rayon) et `food_package` ; aliments de catalogue = `source='manual'`, `external_id='cat:<slug>'` ; icônes résolues par slug.

**BDD (Supabase, projet `wbnyngsngppwlsggkorm`)** : le **MCP Supabase** est disponible (`execute_sql`, `apply_migration`, `generate_typescript_types`, `list_tables`…). Après toute migration → régénérer `src/lib/supabase/database.types.ts`. Migrations dans `supabase/migrations/` (dernière : `0018`). C'est le **même** projet en dev et en prod.

**Vérifier le rendu** : `npm run dev` (`http://localhost:3000`) ou la prod `https://mealings.netlify.app` ; extension **Claude in Chrome** connectée pour piloter un onglet (lire console/réseau). Compte de test : foyer « Maison » / profil **SAWADA** (`d4bc16e7-19fa-4976-92f9-c6b6d1662e90`). ⚠️ Piège outil constaté : en pilotant le navigateur, le **1er clic juste après une navigation est souvent absorbé** (hydratation du composant client) — re-cliquer ; et préférer les clics par coordonnées si une `ref` semble périmée.

### Prochaine session — actions à effectuer

1. **Poursuivre l'optimisation de la section Liste de courses** (chantier principal — beaucoup de détails restent à ajuster ; voir `docs/courses-ux-refonte.md`).
   - ✅ **Fait (2026-06-18)** — *« tout part dans Autres »* : deux causes. (a) **Dérive libellé↔affichage** — `food.category` stockait un libellé qui devait matcher exactement `product-assets.tsx` ; 4 rayons sur 8 avaient dérivé → passé à une **clé stable** (migration `0011_category_keys` ; libellé/teinte/ordre/icône dérivés côté UI via `categoryDef`/`categoryLabel`/`CATEGORY_ORDER` ; rayon `boulangerie` ajouté). (b) **Ajouts libres non liés** — `addManualAction` auto-relie au catalogue par libellé normalisé exact (`findCatalogFoodIdByLabel`) + backfill des manuels existants. Normalisation unifiée dans `src/lib/text.ts`.
   - ✅ **Fait (2026-06-18)** — *manuel déjà en stock* : marqueur **« déjà en stock (qté) »** (non masqué — décision validée), via `ShoppingLine.alreadyStocked`/`stockedLabel`.
   - ✅ **Fait (2026-06-18)** — *couverture catalogue* : catalogue élargi à **~340 aliments** FR (migration `0012`) ; **couche de synonymes** `src/lib/food-synonyms.ts` (alias → slug : « filet de poulet » → poulet, « moutarde de Dijon » → moutarde, pluriels -x…) ; **classement des lignes libres au rendu** (`loadCatalogIndex`/`matchCatalog` dans `core/foods.ts`, utilisés par `generateShoppingList` pour les besoins de recette free_text + manuels/récurrents non liés). Vérifié en direct : household de test → plus aucune section « Autres ».
   - ✅ **Fait (2026-06-18)** — *personnalisation des rayons* : migration `0013` (`shopping_category` + `household_food_pref`, RLS foyer) ; `core/categories.ts` ; `resolve()` dans `generateShoppingList` applique **préférence foyer → catalogue**. UI `category-controls.tsx` : bouton **« Ranger »** par ligne (choisir/créer un rayon, choisir une icône de la banque, réinitialiser) + aside **« Mes rayons »**. Déplacement **mémorisé** par libellé (re-classé ensuite). Garde-fou auth ajouté en tête de `page.tsx`. Vérifié en direct.
   - ✅ **Fait (2026-06-18)** — *banque d'assets enrichie* : import du handoff Claude Design v2 (`design/handoff-courses/.../produits-assets.js`) intégré dans `product-assets.tsx` — ~80 pictos produits (citron/herbes refaits ; poireau, aubergine, avocat, baguette, croissant, tofu, plat préparé, burger…) + nouveau set **`CATEGORY_ICONS`** (emblèmes de rayon). `ProductIcon` résout produits + emblèmes ; picker d'icône article = PRODUCTS, picker de rayon custom = CATEGORY_ICONS.
   - ✅ **Fait (2026-06-18)** — *chantier D — import USDA/OFF assisté IA* : `src/lib/ai/categorize-food.ts` (`classifyImportedFood` → `{ nom générique FR, rayon ∈ liste fermée }`, mode JSON Groq, best-effort). Branché dans `importFood` (foods.ts) **à la création** d'un aliment externe → nom court FR (sans marque) + rayon ; **nutrition inchangée** (fournisseur, garde-fou n°3). `addManualAction` affiche le nom de l'aliment lié (générique/curé) au lieu de la saisie brute. Vérifié en direct : « SALMON » (USDA) → « Saumon » / proteines, 9 nutriments conservés.
   - ✅ **Fait (2026-06-18)** — *UX-14 mode magasin* : `/courses/magasin` (vue plein écran « En magasin » : progression, liste par rayon en gros boutons, coche=barré, CTA collant « J'ai fait mes courses »), entrée via bouton « Mode magasin ». Groupement rayon extrait dans `courses/rayons.ts` (partagé). Finition : modale « Ranger » — coins arrondis corrigés (scroll d'un wrapper intérieur).
   - ✅ **Fait (2026-06-18)** — *fusion inter-sources + sommes sensibles aux unités* : `generateShoppingList` réduit désormais toutes les contributions (besoins recette, récurrents, manuels) à **une ligne par identité produit** (clé canonique `cf:<foodId>` / `cl:<libellé normalisé>`) via un unique `contribute()`. Sommes **par dimension** (`QtyAcc`/`addQty`/`finalizeQty` + `toBase`/`fromBase`) : `1 L + 50 cl + 2 L = 3.5 L`, `500 g + 1 kg = 1500 g` ; repli somme brute si unité inconnue / dimensions mêlées. `ShoppingLine` porte `sources[]` (un badge par provenance), `manualIds[]`, `manualOnly` (qté éditable/supprimable seulement si 100 % manuel). **État coché unifié** par clé canonique dans `shopping_item_state` (abandon de `shopping_manual_item.checked` + `toggleManualCheckAction` supprimée) ; mode magasin aligné. Vérifié en direct (Lait fusionné `essentiel`+`ajouté` = 3.5 L ; Farine = 1500 g). Détail : `docs/courses-ux-refonte.md` (§ « Fusion inter-sources… »).
   - ✅ **Fait (2026-06-18)** — *auto-catégorisation texte libre de recette + « Ajouter un rayon » anti-doublon* : (a) `generateShoppingListAutoSorted` (shopping.ts) enveloppe `generateShoppingList` et classe les lignes en « Autres » (texte libre non rapproché du catalogue, ex. « bœuf en cubes ») via `classifyImportedFood` (IA, best-effort) puis **mémorise** le rayon (`setFoodPref`, une fois par libellé) ; appliqué en mémoire pour un rendu immédiat ; utilisé par `courses/page.tsx` + `magasin/page.tsx` (generateShoppingList reste pur pour le checkout). (b) `ManageAislesButton` affiche d'abord les **rayons prédéfinis** (chips info) + garde-fou anti-doublon (nom normalisé == prédéfini/custom existant → message + création bloquée). Rappel : « Ranger » proposait déjà tous les prédéfinis (même vides). Vérifié en direct (« bœuf en cubes » → Viandes & poissons ; saisie « Boissons » → bloquée).
   - ✅ **Fait (2026-06-18)** — *recette → liste de courses (« Ajouter les ingrédients manquants »)* : une recette **sauvegardée** peut enfin pousser ses ingrédients vers la liste (avant : seulement via le flux Générer IA ou le planning). `recipeMissingIngredients` (shopping.ts) = ingrédients non couverts par le stock (couverture extraite dans le helper partagé `loadStockCoverage`, utilisé aussi par `generateShoppingList`) ; `addRecipeMissingToShoppingAction` (`recettes/[id]/actions.ts`) insère en `shopping_manual_item` **liés au catalogue** (rayon + icône) ; bouton client `add-missing-to-shopping.tsx` sur le détail recette (reste sur la page + feedback « N ajoutés »). Vérifié circuit complet : omelette → 5 ajoutés, rayons corrects (Œufs/Parmesan/Lait → Crémerie, Huile d'olive → Épicerie, Sel fusionné).
   - ✅ **Fait (2026-06-18)** — *fiche produit : navigation fluide + animation* : (a) la fiche retient sa page d'origine via `?from=` (liste ou stats) → bouton retour libellé + ciblé en conséquence ; au retour, l'article consulté est mis en valeur via `?viewed=<foodId>` (scroll à vue + fond sauge/liseré vert dérivés **directement du param** dans `shopping-list.tsx`, puis `router.replace('/courses')` après ~1,8 s → fondu de sortie). (b) **Animation Framer Motion** (`motion@12`, compatible React 19/Next 16) : `produit/[id]/fiche-transition.tsx` = `AnimatePresence`+`motion.div` (entrée fondu+`y:12→0`, sortie fondu+`y:0→-8`). La sortie ne joue que sur le **bouton retour de la fiche** (le bouton « précédent » navigateur reste instantané — volontaire) : le bouton déclenche l'exit puis navigue via `onExitComplete` (le déclencheur est passé via un contexte React, car la fiche est un Server Component et le bouton est rendu dans les children). Piège évité : un `setState` différé dans un effet se faisait avorter au re-render → surbrillance dérivée du param, pas d'un state.
   - ✅ **Fait (2026-06-18)** — *survol + cadence retirée* : (a) **hover** sur chaque ligne de la liste (`hover:bg-sage-tint/40`, `transition-all duration-200`) pour révéler la surface cliquable de la tuile — appliqué aussi aux lignes de l'**historique** (`historique/trip-card.tsx`, `ItemRow`, `transition-colors`). (b) **sélecteur « Courses sur : Quelques jours / 1 semaine / 2 semaines » supprimé** (`courses/page.tsx`) — jugé inutile ; la fenêtre utilise désormais l'horizon foyer par défaut (`shopping_horizon_days`, `getShoppingWindow`). `setShoppingHorizonAction` reste défini dans `actions.ts` mais n'est plus appelé.
   - ✅ **Fait (2026-06-18)** — *fiche produit accessible depuis n'importe quelle page* : composant partagé **`src/components/food-link.tsx`** (`FoodLink` : rend un `<Link>` vers `/courses/produit/[foodId]?from=<page>` si `foodId`, sinon un `<span>` ; affordance vert+souligné au survol seulement ; sans état → utilisable serveur **et** client). Back-nav de la fiche **généralisée** (`produit/[id]/page.tsx`) : map préfixe→libellé (Liste de courses / Statistiques / Historique / En magasin / Stock / Recette / Planning / Nutrition), n'accepte qu'un chemin **interne** (regex `^/(?!/)` anti open-redirect), `?viewed` conservé seulement pour `/courses`. Branché : **Stock** (liste + « à consommer en priorité » ; `food_id` ajouté au select + à `StockExpiry`/`conservation.ts`, `from=/stock`), **ingrédients de recette** (`recettes/[id]`, `food_id` ajouté au select — *inactif tant qu'aucun ingrédient n'est lié au catalogue : 0 en base aujourd'hui, tous en `free_text`*), **historique** (`foodId` propagé via `HItem`, `from=/courses/historique`). **Volontairement écartés** : mode magasin (tap=cocher, un lien gênerait le geste), modale de reconduction (cases à cocher), Nutrition (noms de nutriments, pas d'aliments), Planning (recettes → page dédiée). Vérifié en direct : Stock 12 liens (retour « Stock »), Historique 9 liens (retour « Historique »).
   - ✅ **Fait (2026-06-19) — les 6 constats du test live + gestion de liste (migration `0018`)**. Vérifié en direct (foyer Maison/SAWADA) ; build + tsc + eslint verts. Détail :
     1. ✅ *« Ajouter les ingrédients manquants » n'ajoute plus ce qui est en stock* — **tranché** : présent en stock = couvert. `loadStockCoverage` (`core/shopping.ts`) indexe désormais le stock **lié au catalogue par NOM** dans `stockByLabel` (un besoin de recette en texte libre « Beurre »/« Sel » est reconnu couvert par l'article de stock lié). `recipeMissingIngredients` utilise un nouveau `preciseShortfall` : on ne re-propose un article présent que si l'on **prouve un manque en unités compatibles** (sinon couvert — fini les « Beurre 1 c. à soupe » vs « 40 g »). Vérifié : Omelette au lait → seuls Œufs + Lait ajoutés, Beurre & Sel couverts.
     2. ✅ *Re-clic = doublons* — `addRecipeMissingToShoppingAction` dédoublonne en base (aliment lié OU libellé normalisé déjà présent → sauté). Vérifié : re-clic → « rien à ajouter ».
     3. ✅ *Retrait de n'importe quelle ligne* — corbeille sur **toutes** les lignes : 100 % manuelle → suppression réelle (`shopping_manual_item`) ; générée (repas/essentiel/catalogue) → **retrait de la liste courante** via `shopping_item_state.dismissed` (réversible, remis à zéro au passage en caisse). Couple `removeLinesAction`/`undoRemoveLinesAction` + toast d'annulation (`pushUndoToast`).
     4. ✅ *`add-article.tsx` course async* — verrou : pendant la soumission, la liste de suggestions est figée/fermée et les résultats tardifs ignorés (`submitting` dans le debounce + condition d'affichage).
     5. ✅ *Checkout + unités* — `checkoutPurchasedToStock` réconcilie via `toBase/fromBase` (`mergeStockQuantity`) : même unité → somme ; unités différentes mais compatibles (g↔kg, ml↔cl↔L) → somme convertie dans l'unité du stock ; **incompatibles** (dimensions différentes) → présence marquée, quantité inchangée (limite assumée — la normalisation fine relève de la section Stock).
     6. ✅ *`computeShoppingStats` « courses/semaine »* — borne min de fenêtre (7 j) : plus d'explosion quand plusieurs relevés tombent le même jour.
   - ✅ **Fait (2026-06-19) — nouvelles fonctions de gestion de liste demandées** :
     - **Suppression d'un rayon de la liste active** (≠ mémoire) : bouton « vider » sur l'en-tête de chaque rayon (confirm inline) → retire toutes ses lignes (manuel = supprimé, généré = dismiss) avec annulation. Disponible **aussi dans l'historique** : « vider » par rayon en mode Éditer d'un relevé (`deleteTripItemsAction`/`deleteTripItems`).
     - **Multi-sélection inter-rayons** : bouton « Sélectionner » → cases par ligne + barre d'actions collante (n sélectionnés) : **Essentiels** (`bulkPromoteEssentialsAction`), **Ranger…** (`BulkRangerModal` → rayon existant ou nouveau, `bulkSetCategoryAction`), **Retirer** (removeLines + undo).
     - **Réordonnancement des rayons** (ordre du **mode magasin** + liste) : section « Ordre des rayons » dans le gestionnaire « Ajouter un rayon » (flèches ↑/↓ par rayon, `moveRayonAction`). Persisté par foyer dans **`household_rayon_order`** ; `groupByRayon`/`orderRayonKeys` (`rayons.ts`) appliquent l'ordre à la liste ET au mode magasin (`loadRayonOrder`/`saveRayonOrder` dans `core/categories.ts`).
     - **BDD** : migration **`0018_courses_list_management`** (= `shopping_item_state.dismissed`/`dismissed_at` + table `household_rayon_order`, RLS foyer). **Dernière migration en base = 0018.** Types régénérés.
   - ✅ **Fait (2026-06-19) — passe responsive mobile de la liste** : la rangée d'article était dense (★, Ranger, badges, qté, corbeille, poignée) → risque de débordement horizontal sous ~390 px. Désormais, **sous `lg` les actions (Essentiel / Ranger / Retirer) sont regroupées dans un menu « ⋯ »** (`RowActionsMenu` dans `shopping-list.tsx`, ferme au clic extérieur) et la **poignée de glissement est desktop-only** (le tactile utilise « Ranger ») ; sur `lg+` les actions restent inline. La **modale « Ranger » est contrôlée au niveau de la ligne** (`RangerModal` extrait de l'ex-`RangerButton`) pour survivre à la fermeture du menu. Badges compactés sur mobile : provenance en **icône seule** (`ProvenanceBadge labelHiddenOnMobile`), « déjà en stock (qté) » → **« en stock »** sous `sm` ; **nom tronqué** (`flex-1 truncate min-w-0`). Vérifié : desktop inchangé ; logique du menu mobile testée (ouvre → Essentiel/Ranger/Retirer → « Ranger » ouvre la modale). *Note outillage : viewport mobile réel non capturable ici (extension Chrome figée à 1280 px ; preview non authentifiée) — validation structurelle + logique.*
   - ✅ **Fait (2026-06-19) — 8 retours du test mobile utilisateur** (vérifiés sur desktop + logique ; chemins tactiles purs #2/#6 à confirmer sur device) :
     1. **« Ajouter un article » au-dessus de « À acheter » sur mobile** : `courses/page.tsx` passe en `flex-col` (ordre saisie → liste → essentiels) puis `lg:grid` avec placement explicite (liste à gauche pleine hauteur, ajout sticky + essentiels à droite).
     2. **Glisser une tuile par appui long (mobile)** : `armLongPress` (≈350 ms, annulé au scroll) sur la `<li>` → `startItemDrag` ; la poignée ⠿ reste pour le desktop. Pendant un glisser : `body.touchAction='none'` (pas de scroll parasite).
     3. **Barre de sélection plus visible** : bandeau **sombre** (`var(--color-ink)`, texte clair, pastilles `bg-white/10`) au lieu de `bg-surface` qui se fondait.
     4. **Repli par chevron** : rayons en collapsibles contrôlés (chevron ▼/▶, état `collapsed`) ; « Déjà pris » garde un chevron natif (`group-open:rotate-180`). Plus de texte « afficher / masquer ».
     5. **« Vider » revu** : icône corbeille (cible 32 px) + **pop-over** de confirmation (`ViderRayon`) avec boutons `btn-danger`/`btn-secondary` — plus de mini « Oui/Non » difficile à viser.
     6. **Réordonner les rayons par glisser** : poignée ⠿ sur l'en-tête (desktop) + appui long (mobile) → `startRayonDrag`, dépôt sur un autre rayon → `reorderRayonsAction` (ordre complet du foyer ; les articles suivent). La section « Ordre des rayons » du gestionnaire reste en complément.
     7. **Mode magasin — prix au cochage** : nouveau client `magasin/store-list.tsx` ; cocher un article révèle un champ **Prix** sur place ; prix partagés avec la modale via `PurchaseCheckout` en mode **contrôlé** (`prices`/`onPriceChange`). Saisie du prix **plus tard** dans l'historique : déjà possible (mode « ✎ Éditer » d'un relevé).
     8. **Fiche produit depuis l'historique** : `FoodLink` a un **feedback de tap** (`active:bg-sage-tint`) ; au **retour**, le relevé consulté **reste ouvert** (lien `from=/courses/historique?trip=<id>` → `TripCard defaultOpen` + scroll à vue) — on ne perd plus le fil.
   - ✅ **Fait (2026-06-19) — 2ᵉ vague de retours mobile** (drag, ergonomie, perf) :
     1. **Drag tactile réparé** (`shopping-list.tsx`) : pendant le glisser on bloque le scroll natif via un listener `touchmove` non-passif `preventDefault` (le `pointermove` ne suffit pas sur mobile) + `body touch-action/user-select none`, et on **auto-scrolle** quand le pointeur approche le haut/bas de l'écran (vitesse croissante, boucle `requestAnimationFrame`, cible recalculée pendant le scroll). S'applique aux tuiles ET aux rayons.
     2. **Menu contextuel du navigateur bloqué** pendant l'appui long (listener `contextmenu` preventDefault dès l'armement + `onContextMenu`/`WebkitTouchCallout:none` sur tuile & en-tête) — il annulait le glisser.
     3. **Icône corbeille** refaite (bac à couvercle, `TrashIcon` partagé) sur **pastille rouge pâle** (`bg-clay-tint`) — repérable. Appliquée à RemoveButton, ViderRayon, menu ⋯, et historique.
     4. **Fiche produit pour tout article** : à l'ajout d'un texte libre non reconnu, on **crée une fiche catalogue** (`getOrCreateCatalogFood`, `cat:<slug>`, nom+rayon via IA, nutrition NON touchée) → cliquable + nutrition/conservation à la demande (corrige Morue/Truffe). Bonus perf : moins de lignes « non classées » → moins d'IA d'auto-tri au rendu.
     5. **Édition d'un relevé d'historique** : le formulaire qté/unité/prix passe en **2ᵉ ligne pleine largeur** (`trip-card.tsx`) — ne déborde plus sur mobile.
     6. **Mode magasin — tri des cochés** : articles cochés en bas de leur rayon, rayons terminés en bas (interrupteur « Cochés en bas » en haut pour activer/désactiver ; OFF = positions fixes). `store-list.tsx`.
     7. **Mode magasin — prix** : bouton **« OK »** (+ touche Entrée, `enterKeyHint="done"`) pour fermer le clavier numérique après saisie.
     8. **Perf** : cochage **optimiste** en mode magasin (bascule instantanée, sync serveur en arrière-plan) → plus d'attente du round-trip à chaque coche. (Cause de la lenteur générale = pages rendues serveur sur Netlify serverless : cold starts + requêtes Supabase + appels API externes USDA/OFF (recherche ~1,2 s) / IA dans le chemin de requête. Pistes futures : différer USDA dans `searchFoodCatalog`, cache.)
   - ✅ **Fait (2026-06-19) — perf : coche optimiste liste + parallélisation des requêtes** (suite au constat « tout prend ~4 s même sans API ») :
     - **`generateShoppingList` parallélisé** (`core/shopping.ts`) : ~8 requêtes Supabase qui partaient EN SÉRIE (planned_meal, day_off, recurring, manual, item_state, stock coverage, catalogue, prefs) → un seul `Promise.all` ; seules `recipe_ingredient` (dépend des repas) et `food` (dépend des ids) restent séquentielles. Profite à TOUT ce qui re-rend la page (coche, déplacement, navigation, mode magasin). Cette fonction est appelée à chaque rendu/révalidation, c'était la cause principale de la latence.
     - **Coche/décoche optimiste dans la liste** (`shopping-list.tsx`, `useOptimistic`) : l'article cochée disparaît **instantanément** de « À acheter » (réconcilié par la révalidation qui le place dans « Déjà pris »), idem au décochage — fini l'attente de 4 s avant que la ligne ne bouge.
     - Renommage : interrupteur du mode magasin « Cochés en bas » → **« Tri auto »**.
     - Reste possible si encore lent : `revalidatePath` re-rend toute la page → envisager `router.refresh` ciblé ou des routes plus granulaires ; navigations (retour fiche, mode magasin) = rendu serveur incompressible (hors cache).
   - ✅ **Fait (2026-06-19) — fluidité navigation : squelettes + déplacement optimiste** :
     - **`loading.tsx`** ajoutés pour `/courses`, `/courses/magasin`, `/courses/historique`, `/courses/historique/stats`, `/courses/produit/[id]` → Next affiche un **squelette instantané** pendant le rendu serveur (la navigation *paraît* immédiate : c'était la plainte « changer de page prend du temps », notamment retour de fiche et ouverture du mode magasin).
     - **Déplacement d'aliment optimiste** (`shopping-list.tsx`, action `move` de `useOptimistic`) : la tuile change de rayon **tout de suite** (préférence enregistrée en arrière-plan). Avec la coche optimiste déjà faite, toutes les interactions in-page de la liste sont instantanées.
     - **Cap vers une vraie SPA** (si fluidité encore insuffisante au quotidien) : la limite restante = chaque navigation/mutation = aller-retour serveur (RSC). La refonte « lourde » = passer la section Courses en **données client mises en cache** (SWR/React Query ou un store), mutations optimistes partout, sync serveur en arrière-plan → navigations entre sous-pages quasi instantanées (données déjà en mémoire). À chiffrer/valider avant de se lancer (gros chantier, change l'archi RSC actuelle).
   - 🚧 **Chantier PWA préchargée + hors-ligne (2026-06-19, par étapes)** — plan validé : `~/.claude/plans/effervescent-wandering-quill.md`. Décisions : cache de données **maison** (IndexedDB, zéro dépendance) ; **socle PWA d'abord**. Objectif : app installable qui **s'ouvre hors-ligne**, sert les infos fixes instantanément côté client, ne tape la BDD que pour combler les trous, et permet le **mode magasin 100 % hors-ligne** (fiches produits pré-chargées à la construction de la liste + file de synchro des coches/prix).
     - ✅ **Phase 1 — socle PWA FAITE** : `src/app/manifest.ts` (manifest installable), icônes PNG 192/512/maskable (`public/icon-*.png`, générées par `scripts/gen-icons.mjs` via `sharp` en devDep), service worker `public/sw.js` (app-shell cache-first + navigations network-first→cache→`/offline`, JAMAIS Supabase/API), enregistrement `src/app/sw-register.tsx` (prod only, monté dans le layout racine), page `src/app/offline/page.tsx`, exclusions `proxy.ts` (sw.js/manifest), en-têtes `/sw.js` dans `next.config.ts`. **Vérifié en prod local** (`npm start` puis serveur coupé) : SW enregistré + actif (scope `/`), et navigation hors-ligne servie depuis le cache (pas l'erreur navigateur). NB : tester `next dev` n'enregistre PAS le SW (volontaire) → vérifier sur le déploiement Netlify (prod). Si un SW traîne en local après un test prod, le désinscrire (DevTools → Application).
     - ✅ **Phase 2 — cache données client : socle + mode magasin FAITS** : `src/lib/offline/idb.ts` (kv IndexedDB, zéro dép.) + `src/lib/offline/cache.ts` (`useCachedResource` : cache d'abord → revalidation réseau → réécriture, revalide au retour online). **Mode magasin converti** : page allégée (auth seule) → `magasin/magasin-view.tsx` (client, cache-first) + `magasin/actions.ts` (`getMagasinSnapshotAction`, instantané sérialisable réutilisant generateShoppingListAutoSorted). Résultat **vérifié en dev** : ouverture instantanée depuis le cache, instantané persisté en IndexedDB (→ lecture hors-ligne), coche optimiste + Tri auto + prix toujours OK ; `PurchaseCheckout` accepte `onDone` → la vue magasin se rafraîchit après caisse.
     - ✅ **Phase 2 — liste `/courses` en cache-first FAITE** : `cache.ts` expose un `refresh` **awaitable** (`Promise<void>`, garde anti-course `reqId`) ; `snapshot.ts` (`getCoursesSnapshotAction` = instantané sérialisable : rayons actifs, déjà pris, rayons custom, ordre, essentiels, refs anti-doublon, items de caisse) ; `courses-view.tsx` (client, `useCachedResource('courses:snapshot')`) remplace le corps de l'ex-page serveur ; `page.tsx` allégée (auth seule). Comme `revalidatePath` ne met plus à jour l'affichage, **chaque mutation appelle `useCoursesRefresh()`** (contexte `courses-refresh.tsx`) **et `await refresh()` AVANT de clore la transition** → les états optimistes (coche/déplacement) se réconcilient sans clignotement. Câblé dans `shopping-list.tsx` (toggle, épingle, qté, retrait+undo, essentiels/ranger en masse, glisser tuile+rayon), `category-controls.tsx` (ranger/créer/supprimer/réordonner rayon), `add-article.tsx` (ajout), `essentials-manager.tsx` (désépingler, no-op hors page Courses), `courses-view.tsx` (Tout décocher, checkout via `onDone`). **Vérifié en dev** : affichage instantané depuis le cache, coche→Déjà pris + Tout décocher + ajout texte libre tous réconciliés correctement.
     - ✅ **Phase 3 (coches/prix hors-ligne) FAITE** : `src/lib/offline/queue.ts` (file FIFO IndexedDB). `store-list.tsx` est offline-aware : coches + prix **persistés** (`magasin:checks`/`magasin:prices` → survivent à un rechargement sans réseau), synchro serveur immédiate si en ligne sinon **mise en file** (déclenchée aussi si l'appel échoue), **rejouée au retour réseau** (événement `online` + au montage) ; bandeau « N coche(s) en attente ». `PurchaseCheckout.onDone` → `afterCheckout` efface l'état offline. **Vérifié de bout en bout** (prod local : serveur coupé → coche → file + persistance + bandeau ; serveur rétabli → flush → `shopping_item_state` synchronisé, file vidée). Le **passage en caisse** reste en ligne (les coches sont déjà synchronisées avant).
     - ✅ **Phase 3 (fiches produits hors-ligne) FAITE** : `getProductBundleAction` / `prefetchListFichesAction` (`produit/[id]/actions.ts`) renvoient un *bundle* sérialisable par produit (prix + habitudes via `computeProductStats` + nutrition **stockée** via `getFoodNutrition` ; pas d'appel fournisseur). Bouton **« Préparer pour le magasin »** (`prepare-offline.tsx`, sur la liste) → appel groupé → persiste chaque bundle en IndexedDB (`fiche:<foodId>`) ; libellé « Prêt hors-ligne (N) ». **Fiche convertie en cache-first** : `produit/[id]/page.tsx` allégée (auth + calcul du retour) → `fiche-view.tsx` (client, `useCachedResource('fiche:<id>')`) → ouverture instantanée + **consultation hors-ligne** des fiches pré-chargées ; conservation/conseils (IA) restent à la demande (en ligne). **Vérifié en dev** : « Préparer » → 2 bundles cachés (nutrition 9 valeurs incluse) ; fiche Saumon rendue depuis le cache (prix/habitudes/nutrition). **Reste Phase 3** : compléter au pré-chargement la nutrition jamais stockée (USDA, best-effort) ; checkout 100 % hors-ligne (optionnel).
     - ⏳ **Phase 4** — finitions (indicateur on/offline, statut sync, invalidation cache).
   - ⏳ **Reste** : enrichir synonymes/catalogue à l'usage ; finitions diverses. (Périmètre Courses majeur entièrement couvert et testé en direct.) ⚠️ Constat 5 : la fusion stock sur **unités incompatibles** (ex. c. à soupe vs g) reste non sommée — à traiter avec la normalisation d'unités de la **section Stock**. ⚠️ À confirmer sur device : appui long pour glisser tuiles & rayons (drag tactile retravaillé mais non testable hors device).
2. **Tests & vérification** : extension **Claude in Chrome** connectée (piloter un onglet, lire console/réseau) + skills `verify` / `playwright-cli`. Local : `npm run dev` sur `http://localhost:3000` ; prod : `https://mealings.netlify.app`.
3. **Passe composants + icônes** : composants React partagés (Button, Field, Card, Badge, Nav, Bubble) + icônes **Lucide** (lib à installer) ; convertir les écrans aux primitives plutôt qu'aux classes utilitaires.
4. **SMTP custom Supabase** : configurer un fournisseur d'emails (Auth → Settings → SMTP) pour fiabiliser confirmation/reset (l'envoi intégré est rate-limité — voir « Déploiement production »).
5. **Nettoyage git** : supprimer la branche `design-system-foundations` (origin) maintenant que son contenu est dans `main`.
6. *(Optionnel)* **`/design-sync`** : une fois les composants codés, les pousser vers le projet Claude Design pour boucler la synchro (nécessite d'autoriser l'accès design sur le login claude.ai).
7. **PWA / hors-ligne** : ✅ **Phase 1 faite** (installable + ouverture hors-ligne, cf. « Chantier PWA » ci-dessus). Reste Phases 2-4 (cache données client, mode magasin offline, finitions).

### Idées futures — statistiques & visualisations par section (à proposer/chiffrer le moment venu)

Vision transverse de l'utilisateur (juin 2026) : ajouter, **section par section**, une couche « stats » (chiffres + graphes) au-dessus des données historisées. **Ne pas implémenter d'avance** — à proposer/valider quand on travaillera la section concernée.

- **Courses** : ✅ **FAIT** (juin 2026) — onglet « Statistiques » de l'historique (`/courses/historique/stats`) : cadence, panier moyen + tendance, top produits, répartition par rayon, provenance, « À racheter bientôt » (actionnable), évolution hebdo, one-shots, **dépenses** (prix optionnel, migration 0015). Voir `docs/courses-ux-refonte.md`. Reste possible : affiner les calculs à l'usage.
- **Stock** : graphes d'**évolution du stock d'un aliment** dans le temps (entrées/sorties, niveau). ⚠️ Le stock est aujourd'hui un **instantané** (pas d'historique de mouvements) → nécessitera d'abord un **journal d'événements stock** (entrées via courses, sorties via consommation) avant tout graphe. À chiffrer.
- **Recettes** : chiffres sur les recettes — les plus **reconduites** (depuis `planned_meal`), les plus rapides (`prep+cook`), etc.

Principe : ces vues sont **dérivées** (lecture seule) des données déjà historisées ; garder les tables d'historique **extensibles** (principe n°8) pour les alimenter.

### Historique des courses (FAIT — juin 2026)

À chaque « J'ai fait mes courses » validé, un **relevé daté** des articles achetés est archivé, consultable dans **`/courses/historique`** (liste par date, favoris en tête, 5/page, dépliable). **Pas de lien au stock** — pur suivi. Base extensible pour les futures stats Courses (ci-dessus).
- **Migrations `0014_shopping_history`** (`shopping_trip` + `shopping_trip_item`, snapshot immuable, RLS foyer) **+ `0015_shopping_trip_price`** (`price` optionnel pour les stats dépenses). **Dernière migration en base = 0015.** Rétention historique = **6 mois** (`TRIP_RETENTION_MONTHS`).
- **Onglet Statistiques** : `src/lib/core/shopping-stats.ts` + `historique/stats/` + `historique/tabs.tsx`. Prix saisi au checkout (`purchase-checkout.tsx`) et dans le relevé. Détail : `docs/courses-ux-refonte.md` (§ Onglet Statistiques).
- **Essentiels — modèle hybride** (refonte du concept, juin 2026) : l'app détecte (« À racheter bientôt »), l'utilisateur promeut en 1 clic (**★ Toujours** dans les stats, ou **épingle ☆** sur une ligne) → `promoteToEssentialAction`. L'essentiel revient tout seul (badge `essentiel`) et est exclu des suggestions. Géré dans `essentials-manager.tsx` (carte stats + aside courses, désépinglage ×). `listRecurringItems` (shopping.ts). Avant : concept orphelin (aucune UI ne créait d'essentiel). Détail : `docs/courses-ux-refonte.md` (§ Refonte « essentiel »).
- **Prix au checkout + pré-remplissage** : prix optionnel par article au checkout (`purchase-checkout.tsx`) et éditable dans le relevé ; `getLastKnownPrices` pré-remplit le dernier prix payé par produit. Alimente les stats dépenses.
- **Fiche produit** : `/courses/produit/[foodId]` (`produit/[id]/page.tsx`, `sections.tsx`, `actions.ts`). `computeProductStats` (`core/shopping-product.ts`) = évolution du prix + habitudes. Nutrition **à la demande** (`fetchAndStoreNutrition`/`getFoodNutrition` dans foods.ts — fournisseur, jamais l'IA ; le catalogue n'a pas de nutrition pré-stockée). Nutrition à la demande : `fetchAndStoreNutrition` traduit le nom FR→EN (`ai/translate-food.ts`) pour interroger USDA (anglophone), puis persiste les valeurs **du fournisseur** (jamais l'IA). Conservation **estimée par IA** à la demande (`ai/product-conservation.ts`, par lieu de stockage, usages FR, **indicative** — choix validé : corrige une table curée trop grossière ; la table `conservation_guideline` 0016 a été retirée par `0017`). Conseils IA indicatifs (`ai/product-tips.ts`). Entrées : produits cliquables dans les stats + `product-picker.tsx`. **Dernière migration en base = 0018** (cf. gestion de liste ci-dessous). Détail : `docs/courses-ux-refonte.md` (§ Fiche produit).
- **Backend** : `src/lib/core/shopping-history.ts` (`recordShoppingTrip` branché dans `checkoutPurchasedToStock` ; `listShoppingTrips`, `purgeOldShoppingTrips`, `setTripFavorite`, `renameTrip`, `deleteTrip`, `updateTripItem`, `deleteTripItem`, `reconductTripItems`). Couverture stock factorisée dans `loadStockCoverage` (shopping.ts).
- **UI** : `src/app/(app)/courses/historique/` (`page.tsx`, `trip-card.tsx`, `actions.ts`) + lien « Historique » dans l'en-tête Courses. Reconduction = modale de sélection cochable → liste actuelle.
- Détail complet : `docs/courses-ux-refonte.md` (§ « Historique des courses »).

---

## Modèle de données (entités clés)

`Foyer` · `Profil` · `Recette` · `RepasPlanifié` · `ConsommationRéelle` · `Stock` · `TypeNutriment` · `ValeurNutritionnelle` · `ProfilNutrimentSuivi` · `RegleConservation` *(réservée)* · `ListeCourses` *(dynamique, non stockée)* · `ConversationIA` *(réservée)*

Détail complet des attributs et relations : voir section 4 du document source.

---

## Arborescence du code (depuis Phase 0)

- `src/lib/supabase/` — clients navigateur / serveur / admin (+ `types.ts` à régénérer après migration).
- `src/lib/providers/nutrition/` et `src/lib/providers/ai/` — couches d'abstraction fournisseurs (principe n°5). Toute la logique dépend des interfaces, jamais d'un fournisseur concret.
- `src/lib/core/` — fonctions backend réutilisables (principe n°4) : `recipes`, `meals`, `stock`, `consumption`, `household`. UI **et** futur agent IA appellent ces mêmes fonctions.
- `src/proxy.ts` — refresh de session Supabase (ex-middleware).
- `supabase/migrations/` (0001 schéma, 0002 RLS), `supabase/seed.sql`, `supabase/tests/rls_smoke_test.sql`.

## Points de vigilance spécifiques à Phase 0

- Row Level Security Supabase : à configurer **et tester sérieusement**, pas une simple case à cocher.
- `date_ouverture` sur Stock et table `RegleConservation` : réserver les champs dès le schéma initial même si la fonctionnalité est livrée plus tard.
- Structure nutriments : utiliser `TypeNutriment` + `ValeurNutritionnelle` (extensible), jamais des colonnes `calories`, `proteines`, etc. codées en dur.
- Décrémentation du stock : par la **consommation réelle uniquement**, jamais par le planning.
