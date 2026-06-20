-- =============================================================================
-- Mealing — Stock : ordre d'affichage des lieux de conservation (par foyer)
-- =============================================================================
-- Permet de réordonner les lieux (prédéfinis + custom) dans l'ordre voulu, comme
-- l'ordre des rayons en Courses (`household_rayon_order`). Additif, RLS foyer.
-- `location_key` = clé prédéfinie (placard/frigo…) OU uuid d'un storage_location.
-- =============================================================================

create table if not exists public.household_location_order (
  household_id uuid not null references public.household (id) on delete cascade,
  location_key text not null,
  position     integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (household_id, location_key)
);

alter table public.household_location_order enable row level security;
drop policy if exists household_location_order_all on public.household_location_order;
create policy household_location_order_all on public.household_location_order
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
