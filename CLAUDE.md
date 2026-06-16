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

- **Phases 0 à 4 : faites et mergées dans `main`.** Migrations 0001–0007 appliquées en base, RLS testé, types générés. Aucune branche de feature active — développer depuis `main`, une branche par phase.
  - Phase 0 : fondations (schéma, RLS, fournisseurs, backend réutilisable).
  - Phase 1 : auth + onboarding foyer + shell ; Aliments (import USDA+OFF) ; Recettes (CRUD + nutrition calculée) ; Planning hebdo ; Nutrition (agrégation jour/semaine planifié vs réel, objectifs).
  - Phase 2 : Stock ; Liste de courses dynamique (`generateShoppingList`) ; Partage Foyer (membres, invitation + `/invitations/accept`, visibilité nutrition via `nutrition_share`). Accès concurrents couverts par le RLS.
  - Phase 3 : péremption + anti-gaspillage. Seed `conservation_rule` (0007) ; `getStockWithExpiry` (estimation déterministe triée par péremption, sans IA) ; UI stock.
  - Phase 4 : génération de recettes par IA. Mode JSON sur la couche Groq ; `src/lib/ai/generate-recipe.ts` (prompt + zod) ; UI `/recettes/generer`. Garde-fou n°3 respecté (aucune valeur nutritionnelle générée).
- **Reste** : Phase 5 (assistant conversationnel IA lecture seule — contexte repas/stock/macros), 6 (assistant agentique qui appelle les fonctions `core/`).
- Note auth : confirmation email Supabase activée + validation MX des domaines à l'inscription (rejette example.com). Pour tester, créer un user confirmé via SQL.
- Convention UI : les mutations passent par des server actions qui appellent les fonctions de `src/lib/core/` (jamais de logique métier dans les composants).

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
