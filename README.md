# Mealing

Application de planification de repas, suivi nutritionnel et courses, pensée pour
réduire la charge mentale liée à l'alimentation quotidienne.

> Document de référence définitif : [`specifications-projet.md`](./specifications-projet.md).
> Mémoire de travail / règles de dev : [`CLAUDE.md`](./CLAUDE.md).

## Stack

- **Next.js 16** (App Router) + **React 19** + **Tailwind v4** + TypeScript — PWA.
- **Supabase** (PostgreSQL, Auth, Row Level Security).
- Données nutritionnelles : **USDA FoodData Central** (aliments bruts) + **Open Food Facts** (produits emballés).
- IA : **Groq** (API cloud à palier gratuit ; jamais d'hébergement local).
- Hébergement : **Netlify**.

## Architecture du code

```
src/
  app/                     Pages et layouts (App Router)
  proxy.ts                 Rafraîchit la session Supabase (ex-middleware, Next 16)
  lib/
    env.ts                 Variables publiques validées (zod)
    env.server.ts          Secrets serveur validés (zod) — jamais côté client
    supabase/              Clients : navigateur, serveur, admin (+ types générés)
    providers/             Couches d'abstraction des fournisseurs externes (principe n°5)
      nutrition/           USDA + Open Food Facts derrière une interface commune
      ai/                  Groq derrière une interface commune
    core/                  Fonctions backend réutilisables (principe n°4) :
                           recettes, repas, stock, consommation, foyer
supabase/
  migrations/              0001 schéma complet, 0002 RLS + triggers
  seed.sql                 Nutriments de base
  tests/rls_smoke_test.sql Test fumée des invariants RLS
```

## Démarrage local

1. **Variables d'environnement** : copier `.env.example` en `.env.local` et renseigner les clés
   (Supabase, Groq, USDA). `.env.local` est ignoré par git.

2. **Appliquer les migrations à Supabase** (déjà appliquées sur le projet actuel) — deux options :
   - _SQL Editor_ : exécuter dans l'ordre les fichiers de `supabase/migrations/`
     (`0001` schéma → `0002` RLS → `0003` seed nutriments → `0004` grants → `0005` durcissement).
   - _CLI Supabase_ : `npx supabase link --project-ref <REF>` puis `npx supabase db push`.

3. **Vérifier le RLS** : exécuter `supabase/tests/rls_smoke_test.sql` dans le SQL Editor.
   Aucune erreur = isolation foyer et confidentialité nutritionnelle validées.

4. **(Recommandé) Générer les types TS** depuis le schéma :
   ```bash
   npx supabase gen types typescript --project-id <PROJECT_ID> > src/lib/supabase/types.ts
   ```
   Le typage fort se propage alors aux clients et aux fonctions `core/`.

5. **Lancer le serveur de dev** :
   ```bash
   npm run dev
   ```
   Puis ouvrir http://localhost:3000.

## Build & déploiement

- `npm run build` — build de production (type-check + lint compris).
- Déploiement Netlify : connecter le repo, définir les variables d'environnement dans
  _Site settings > Environment variables_ (voir `.env.example`). `netlify.toml` est déjà configuré.

## Règle de contribution

Toute nouvelle fonctionnalité ou tout écart par rapport au document de référence doit être
validé avant implémentation (voir `CLAUDE.md`). Les décisions écartées (IA locale, calcul
nutritionnel par IA, chiffrement de bout en bout, apps natives, publication sur les stores)
ne sont pas à reproposer.
