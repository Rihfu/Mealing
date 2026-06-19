-- =============================================================================
-- Mealing — Stock : lieux de conservation + journal de mouvements
-- =============================================================================
-- Refonte de la section Stock (suite logique de Courses). Trois ajouts PUREMENT
-- ADDITIFS (l'app déployée continue de tourner sans impact) :
--
--   * storage_location : lieux de conservation PERSONNALISÉS d'un foyer (les
--     prédéfinis — placard/frigo/congélateur/cave… — sont des constantes côté code,
--     comme les rayons de Courses).
--   * stock.storage_location : lieu d'un article (clé prédéfinie OU uuid d'un
--     storage_location custom). Couplage souple, pas de FK (cf. rayons) → un lieu
--     custom supprimé fait retomber l'article dans « non rangé » au rendu.
--   * stock.printed_expiry : DLC/DDM réelle saisie/scannée → PRIME sur l'estimation
--     (conservation intelligente : DLC imprimée > estimation IA par lieu > règle curée).
--   * stock_event : JOURNAL de mouvements (entrée via courses, sortie via
--     consommation, ajustement, jeté/périmé) → débloque stats d'évolution, rythme de
--     consommation, prédiction de rupture, suivi du gaspillage (principe n°8 : table
--     d'événements extensible). Le stock reste l'instantané ; le journal l'historise.
-- =============================================================================

-- Lieux de conservation personnalisés d'un foyer.
create table if not exists public.storage_location (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  label        text not null,
  icon_slug    text,                       -- clé d'icône (banque d'assets)
  position     integer not null default 0, -- ordre d'affichage parmi les lieux custom
  created_at   timestamptz not null default now()
);
create index if not exists storage_location_household_idx on public.storage_location (household_id);

alter table public.storage_location enable row level security;
drop policy if exists storage_location_all on public.storage_location;
create policy storage_location_all on public.storage_location
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Stock : lieu de conservation (clé prédéfinie OU uuid storage_location) + DLC imprimée.
alter table public.stock add column if not exists storage_location text;
alter table public.stock add column if not exists printed_expiry date;

-- Journal de mouvements de stock.
create table if not exists public.stock_event (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  stock_id     uuid references public.stock (id) on delete set null, -- null si l'article a été supprimé
  food_id      uuid references public.food (id) on delete set null,
  label        text,
  kind         text not null check (kind in ('in', 'out', 'adjust', 'discard')),
  quantity     numeric,
  unit         text,
  source       text,                       -- 'courses' | 'consumption' | 'manual' | 'expiry'
  occurred_at  timestamptz not null default now()
);
create index if not exists stock_event_household_idx on public.stock_event (household_id, occurred_at desc);
create index if not exists stock_event_food_idx on public.stock_event (food_id);

alter table public.stock_event enable row level security;
drop policy if exists stock_event_all on public.stock_event;
create policy stock_event_all on public.stock_event
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
