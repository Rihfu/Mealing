-- =============================================================================
-- Mealing — Courses : historique des courses (relevés datés par checkout)
-- =============================================================================
-- À chaque « J'ai fait mes courses » validé, on enregistre un RELEVÉ daté de ce
-- qui a été acheté (libellés + quantités). Pur suivi des achats passés — AUCUN
-- lien avec le stock (le stock reste géré dans sa section). Base extensible pour
-- de futures statistiques Courses (fréquence de rachat, taille de panier…).
--
-- Modèle (snapshot immuable, scopé par foyer, RLS) :
--   * shopping_trip       : un relevé = un checkout (date, favori, nom perso).
--   * shopping_trip_item  : les articles achetés du relevé (dénormalisés au moment
--     de l'achat → indépendants des évolutions du catalogue).
--
-- Le nb d'articles d'un relevé est compté à la lecture (pas de colonne à resync).
-- Purge auto (>1 mois, hors favoris) faite côté applicatif à l'ouverture de l'écran.
-- =============================================================================

-- Un relevé daté = un « J'ai fait mes courses » validé.
create table if not exists public.shopping_trip (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  is_favorite  boolean not null default false, -- épinglé en tête + exempté de la purge
  name         text,                           -- nom personnalisé ; sinon affichage par date
  created_at   timestamptz not null default now()
);
-- Tri d'affichage : favoris d'abord, puis chronologique décroissant.
create index if not exists shopping_trip_household_idx
  on public.shopping_trip (household_id, is_favorite desc, purchased_at desc);

alter table public.shopping_trip enable row level security;
drop policy if exists shopping_trip_all on public.shopping_trip;
create policy shopping_trip_all on public.shopping_trip
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Articles achetés d'un relevé (snapshot).
create table if not exists public.shopping_trip_item (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.shopping_trip (id) on delete cascade,
  label        text not null,
  quantity     numeric,
  unit         text,
  category_key text,                           -- clé de rayon (intégrée ou uuid custom), snapshot
  food_id      uuid references public.food (id) on delete set null, -- identité produit (stats futures)
  icon_slug    text,
  source       text                            -- provenance principale au moment de l'achat
);
create index if not exists shopping_trip_item_trip_idx on public.shopping_trip_item (trip_id);

alter table public.shopping_trip_item enable row level security;
drop policy if exists shopping_trip_item_all on public.shopping_trip_item;
create policy shopping_trip_item_all on public.shopping_trip_item
  for all using (
    exists (select 1 from public.shopping_trip t
            where t.id = trip_id and public.is_household_member(t.household_id))
  )
  with check (
    exists (select 1 from public.shopping_trip t
            where t.id = trip_id and public.is_household_member(t.household_id))
  );

-- Privilèges de table (le RLS restreint les lignes ; PostgreSQL exige aussi les grants).
grant select, insert, update, delete on public.shopping_trip to authenticated;
grant select, insert, update, delete on public.shopping_trip_item to authenticated;
