-- =============================================================================
-- Mealing — Chantier D : catalogue d'aliments (schéma)
-- =============================================================================
-- Donne une identité aux articles (fin du 100 % texte libre) et prépare
-- l'autocomplétion + le tri par rayon + les formats courants.
--   - food.category : rayon de courses (Fruits & légumes, Crémerie…), pour le seed
--     et le futur tri par rayon (chantier F).
--   - shopping_manual_item.food_id : identité produit des ajouts manuels (D.3).
--   - food_package : conditionnements courants par aliment (formats : « 1 kg »,
--     « 500 g », « pack de 6 »). Table de référence extensible (principe n°8) (D.4).
-- Additif et nullable → aucun impact sur l'existant.
-- =============================================================================

-- Rayon de courses (texte borné à l'usage ; le tri/ordre viendra avec le chantier F).
alter table public.food add column if not exists category text;

-- Identité produit des ajouts manuels (on garde le texte libre pur en repli).
alter table public.shopping_manual_item
  add column if not exists food_id uuid references public.food (id) on delete set null;
create index if not exists shopping_manual_food_idx on public.shopping_manual_item (food_id);

-- Conditionnements courants par aliment.
create table if not exists public.food_package (
  id          uuid primary key default gen_random_uuid(),
  food_id     uuid not null references public.food (id) on delete cascade,
  label       text not null,                 -- affichage : « 1 kg », « pack de 6 »
  quantity    numeric not null,              -- 1, 500, 6
  unit        text,                          -- codes de src/lib/units.ts ('kg','g','pièce'…)
  is_default  boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists food_package_food_idx on public.food_package (food_id);

alter table public.food_package enable row level security;

-- Table de référence : lecture pour tout authentifié ; écriture réservée au
-- service_role (le seed). Calque conservation_rule.
drop policy if exists food_package_select on public.food_package;
create policy food_package_select on public.food_package
  for select using (auth.role() = 'authenticated');

-- Identité stable des items de catalogue : source 'manual' + external_id = 'cat:<slug>'.
-- N'impacte pas les imports USDA/OFF (source ≠ 'manual') ni les aliments manuels
-- libres (external_id null).
create unique index if not exists food_catalog_slug_idx
  on public.food (external_id) where source = 'manual' and external_id is not null;
