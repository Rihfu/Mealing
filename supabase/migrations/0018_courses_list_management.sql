-- =============================================================================
-- Mealing — Courses : gestion de la liste active (retrait + ordre des rayons)
-- =============================================================================
-- Deux ajouts additifs, scopés foyer, sous RLS (principes n°4/n°8) :
--
--   1. shopping_item_state.dismissed : permet de RETIRER une ligne générée
--      (repas / essentiel / catalogue) de la LISTE COURANTE sans toucher à la
--      source (recette, essentiel, préférence). C'est l'inverse du « coché ».
--      Comme l'état coché, il est remis à zéro au passage en caisse
--      (checkoutPurchasedToStock vide shopping_item_state). Les ajouts 100 %
--      manuels, eux, sont réellement supprimés (shopping_manual_item).
--
--   2. household_rayon_order : ordre d'affichage des rayons CHOISI par le foyer
--      (liste + mode magasin). La clé est soit une clé intégrée ('legumes'…),
--      soit l'uuid d'une shopping_category (rayon custom). Couplage souple, pas
--      de FK (un rayon supprimé → sa ligne d'ordre devient inerte, best-effort).
-- =============================================================================

-- 1) Retrait d'une ligne générée de la liste courante (≠ coché).
alter table public.shopping_item_state
  add column if not exists dismissed boolean not null default false;
alter table public.shopping_item_state
  add column if not exists dismissed_at timestamptz;

-- 2) Ordre des rayons choisi par le foyer.
create table if not exists public.household_rayon_order (
  household_id uuid not null references public.household (id) on delete cascade,
  rayon_key    text not null,                 -- clé intégrée OU uuid de shopping_category
  position     integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (household_id, rayon_key)
);
create index if not exists household_rayon_order_household_idx
  on public.household_rayon_order (household_id);

alter table public.household_rayon_order enable row level security;

drop policy if exists household_rayon_order_all on public.household_rayon_order;
create policy household_rayon_order_all on public.household_rayon_order
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
