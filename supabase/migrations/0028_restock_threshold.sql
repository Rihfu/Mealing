-- =============================================================================
-- Mealing — Seuil de réappro par aliment (réappro intelligent)
-- =============================================================================
-- « Toujours garder ≥ N [unité] de X » : quand le stock d'un aliment passe sous son
-- seuil, l'app propose de l'ajouter à la liste de courses (section « À racheter »).
-- Seuil DURABLE au niveau du foyer (survit à la consommation), 1 par aliment.
-- RLS : foyer (is_household_member). Grants hérités (cf. 0004).
-- =============================================================================

create table public.restock_threshold (
  household_id  uuid not null references public.household (id) on delete cascade,
  food_id       uuid not null references public.food (id) on delete cascade,
  min_quantity  numeric not null,
  unit          text,
  updated_at    timestamptz not null default now(),
  primary key (household_id, food_id)
);
create index restock_threshold_household_idx on public.restock_threshold (household_id);

alter table public.restock_threshold enable row level security;
create policy restock_threshold_all on public.restock_threshold
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
