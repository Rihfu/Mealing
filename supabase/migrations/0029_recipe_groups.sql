-- =============================================================================
-- Mealing — Recettes : groupes personnalisables (parité Courses/Stock)
-- =============================================================================
-- Permet d'organiser les recettes en groupes (« petit déjeuner », « snack »…),
-- de les réordonner, de glisser une recette d'un groupe à l'autre, comme les
-- rayons (Courses) / lieux (Stock). Additif, RLS foyer.
--
-- L'organisation est SCOPÉE FOYER et découplée de la recette : la RLS de `recipe`
-- réserve l'écriture au créateur, mais un groupe est une décision du FOYER → tout
-- membre doit pouvoir ranger n'importe quelle recette visible. D'où une table
-- d'affectation dédiée (`recipe_group_item`) plutôt qu'une colonne sur `recipe`.
-- =============================================================================

-- Groupes (tous personnalisés ; pas de prédéfinis, contrairement aux lieux Stock).
create table if not exists public.recipe_group (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  name         text not null,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists recipe_group_household_idx on public.recipe_group (household_id);

alter table public.recipe_group enable row level security;
drop policy if exists recipe_group_all on public.recipe_group;
create policy recipe_group_all on public.recipe_group
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Affectation recette → groupe + ordre intra-groupe (1 groupe max par recette/foyer).
-- Pas de ligne = « Sans groupe ». Supprimer un groupe → group_id passe à NULL
-- (la recette retombe « Sans groupe », sans perdre son rang).
create table if not exists public.recipe_group_item (
  household_id uuid not null references public.household (id) on delete cascade,
  recipe_id    uuid not null references public.recipe (id) on delete cascade,
  group_id     uuid references public.recipe_group (id) on delete set null,
  sort_index   integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (household_id, recipe_id)
);
create index if not exists recipe_group_item_group_idx on public.recipe_group_item (group_id);

alter table public.recipe_group_item enable row level security;
drop policy if exists recipe_group_item_all on public.recipe_group_item;
create policy recipe_group_item_all on public.recipe_group_item
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
