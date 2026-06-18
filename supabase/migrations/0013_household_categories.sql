-- =============================================================================
-- Mealing — Courses : personnalisation des rayons (catégories foyer + mémoire)
-- =============================================================================
-- Permet à chaque foyer de : créer ses propres rayons, déplacer un aliment vers
-- un rayon (le sien), et MÉMORISER le classement d'un article ajouté en texte
-- libre (re-proposé et reclassé automatiquement la fois suivante).
--
-- Modèle (principe n°8 : tables de référence + valeurs, scopées par foyer, RLS) :
--   * shopping_category    : rayons personnalisés d'un foyer (label, icône, teinte).
--   * household_food_pref  : préférence foyer « libellé/aliment → rayon (+ icône) ».
--     Sert l'override (déplacer) ET la mémoire (re-classer un ajout libre).
--
-- La clé de rayon (`category_key`) est soit une CLÉ intégrée ('legumes', 'epicerie'…
-- définies dans product-assets), soit l'UUID d'une shopping_category (rayon custom).
-- Pas de FK sur ce texte (couplage souple) ; un rayon custom supprimé → l'article
-- retombe en « Autres » au rendu (best-effort, précision approximative assumée).
-- =============================================================================

-- Rayons personnalisés d'un foyer.
create table if not exists public.shopping_category (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  label        text not null,
  icon_slug    text,                       -- clé d'icône (banque d'assets)
  tint         text,                       -- teinte du jeton (CSS var / hex) ; défaut côté UI
  position     integer not null default 0, -- ordre d'affichage parmi les rayons custom
  created_at   timestamptz not null default now()
);
create index if not exists shopping_category_household_idx on public.shopping_category (household_id);

alter table public.shopping_category enable row level security;

drop policy if exists shopping_category_all on public.shopping_category;
create policy shopping_category_all on public.shopping_category
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Préférence de classement d'un foyer pour un libellé (et/ou un aliment de catalogue).
create table if not exists public.household_food_pref (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  label_norm    text not null,             -- libellé normalisé (cf. src/lib/text.ts)
  display_label text not null,             -- libellé affiché / re-proposé
  food_id       uuid references public.food (id) on delete set null,
  category_key  text,                      -- clé intégrée OU uuid de shopping_category ; null = sans rayon
  icon_slug     text,                      -- icône choisie (override d'affichage)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, label_norm)
);
create index if not exists household_food_pref_household_idx on public.household_food_pref (household_id);
create index if not exists household_food_pref_food_idx on public.household_food_pref (food_id);

alter table public.household_food_pref enable row level security;

drop policy if exists household_food_pref_all on public.household_food_pref;
create policy household_food_pref_all on public.household_food_pref
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
