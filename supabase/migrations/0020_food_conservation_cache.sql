-- =============================================================================
-- Mealing — Stock : cache d'estimation de conservation (par aliment, en jours)
-- =============================================================================
-- Conservation INTELLIGENTE : on estime une fois (IA, `estimateConservationDays`)
-- la durée de conservation EN JOURS d'un aliment, par lieu (placard/frigo/congelateur),
-- non-entamé ET entamé, puis on la MET EN CACHE ici → jamais d'appel IA synchrone au
-- rendu de la liste de stock. La conservation d'un aliment est UNIVERSELLE (pas liée à
-- un foyer) → table de RÉFÉRENCE globale (comme la nutrition), lecture/écriture pour
-- tout authentifié. Valeurs INDICATIVES (principe n°2) ; la DLC imprimée saisie par
-- l'utilisateur (stock.printed_expiry) prime toujours dessus.
--
-- `days` (jsonb) : { "placard": {"unopened": int|null, "opened": int|null},
--                    "frigo": {...}, "congelateur": {...} }  (lieux non pertinents omis)
-- =============================================================================

create table if not exists public.food_conservation (
  food_id    uuid primary key references public.food (id) on delete cascade,
  days       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.food_conservation enable row level security;

-- Référence non sensible : lecture + écriture pour tout utilisateur authentifié
-- (enrichissement best-effort, comme le catalogue/nutrition).
drop policy if exists food_conservation_all on public.food_conservation;
create policy food_conservation_all on public.food_conservation
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
