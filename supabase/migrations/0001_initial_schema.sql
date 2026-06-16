-- =============================================================================
-- Mealing — Schéma initial (Phase 0)
-- =============================================================================
-- Couvre l'intégralité du modèle de données de la section 4 des spécifications,
-- y compris les champs et tables RÉSERVÉS (non exploités en V1 mais présents dès
-- le départ pour éviter une refonte ultérieure — principe directeur n°8).
--
-- Conventions :
--   * Clés primaires UUID (gen_random_uuid()).
--   * Enums modélisés en TEXT + CHECK (plus simples à étendre qu'un type ENUM PG).
--   * Les nutriments suivis ne sont JAMAIS des colonnes fixes : référentiel
--     nutrient_type + valeurs nutrient_value (principe directeur n°8).
--   * Un Profil = un utilisateur auth.users. Rattaché à un Foyer (V1 : un seul).
--   * Le RLS est défini dans la migration 0002.
-- =============================================================================

-- gen_random_uuid() est fourni par pgcrypto (activé par défaut sur Supabase).
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helper : updated_at automatique
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- FOYER & PROFILS
-- =============================================================================

-- Foyer : regroupe les profils, porte le Stock et la Liste de courses.
create table public.household (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Profil : un utilisateur authentifié. Porte ses objectifs nutritionnels.
-- id = auth.users.id (relation 1:1 avec le compte d'authentification).
create table public.profile (
  id            uuid primary key references auth.users (id) on delete cascade,
  household_id  uuid references public.household (id) on delete set null,
  display_name  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index profile_household_idx on public.profile (household_id);

-- Invitation réelle au Foyer (email + acceptation), pas un simple champ technique.
create table public.household_invitation (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  email         text not null,
  token         uuid not null default gen_random_uuid(),
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined', 'expired')),
  invited_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users (id) on delete set null
);
create index household_invitation_household_idx on public.household_invitation (household_id);
create index household_invitation_email_idx on public.household_invitation (lower(email));
create unique index household_invitation_token_idx on public.household_invitation (token);

-- =============================================================================
-- RÉFÉRENTIEL NUTRITIONNEL (extensible — principe directeur n°8)
-- =============================================================================

-- TypeNutriment : référentiel extensible des nutriments suivables.
-- is_base = fait partie de la liste de base suivie par défaut pour tous.
create table public.nutrient_type (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                         -- ex. 'energy_kcal', 'iron'
  name        text not null,
  unit        text not null,                                -- ex. 'kcal', 'g', 'mg', 'µg'
  category    text not null check (category in ('energy', 'macro', 'micro')),
  is_base     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Aliment / ingrédient de référence. La source distingue d'où vient la donnée.
create table public.food (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  source        text not null check (source in ('usda', 'openfoodfacts', 'manual')),
  external_id   text,                                       -- fdcId USDA ou code-barres OFF
  barcode       text,
  default_unit  text not null default 'g',
  base_amount   numeric not null default 100,               -- les valeurs sont pour base_amount default_unit
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index food_source_external_idx on public.food (source, external_id);
create index food_barcode_idx on public.food (barcode);
create index food_name_idx on public.food (lower(name));

-- ValeurNutritionnelle : valeur d'un nutriment pour un aliment (pour base_amount).
-- JAMAIS de colonnes calories/protéines/... en dur (principe n°8).
create table public.nutrient_value (
  id                uuid primary key default gen_random_uuid(),
  food_id           uuid not null references public.food (id) on delete cascade,
  nutrient_type_id  uuid not null references public.nutrient_type (id) on delete cascade,
  amount            numeric not null,                       -- quantité par food.base_amount
  created_at        timestamptz not null default now(),
  unique (food_id, nutrient_type_id)
);
create index nutrient_value_food_idx on public.nutrient_value (food_id);

-- =============================================================================
-- RECETTES
-- =============================================================================

create table public.recipe (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  instructions  text,                                       -- étapes (markdown/texte)
  prep_time_min integer check (prep_time_min >= 0),
  cook_time_min integer check (cook_time_min >= 0),
  servings      numeric not null default 1 check (servings > 0),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index recipe_created_by_idx on public.recipe (created_by);

-- Ingrédients structurés d'une recette (quantité + unité).
create table public.recipe_ingredient (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipe (id) on delete cascade,
  food_id     uuid references public.food (id) on delete restrict,
  free_text   text,                                         -- ingrédient libre sans food lié
  quantity    numeric,
  unit        text,
  position    integer not null default 0,
  check (food_id is not null or free_text is not null)
);
create index recipe_ingredient_recipe_idx on public.recipe_ingredient (recipe_id);

-- Tags / filtres de recette (type de plat, régime, etc.).
create table public.recipe_tag (
  recipe_id  uuid not null references public.recipe (id) on delete cascade,
  tag        text not null,
  primary key (recipe_id, tag)
);

-- =============================================================================
-- PLANIFICATION & CONSOMMATION
-- =============================================================================

-- RepasPlanifié : rattaché au Foyer (par défaut) ; marqué individuel le cas échéant.
create table public.planned_meal (
  id                       uuid primary key default gen_random_uuid(),
  household_id             uuid not null references public.household (id) on delete cascade,
  is_individual            boolean not null default false,
  individual_profile_id    uuid references public.profile (id) on delete cascade,
  meal_date                date not null,
  slot                     text not null
                             check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id                uuid references public.recipe (id) on delete set null,
  free_text                text,                            -- repas hors-recette
  total_quantity_prepared  numeric,                         -- décrémente le Stock
  total_quantity_unit      text,
  produces_leftover        boolean not null default false,
  -- Reste réassigné : pointe vers le repas d'origine, sans nouveau besoin de courses.
  leftover_source_meal_id  uuid references public.planned_meal (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Cohérence : un repas individuel doit nommer le profil concerné.
  check (not is_individual or individual_profile_id is not null)
);
create index planned_meal_household_date_idx on public.planned_meal (household_id, meal_date);
create index planned_meal_individual_idx on public.planned_meal (individual_profile_id);

-- Journée entière hors-plan, en un geste (écart global sans validation repas/repas).
create table public.day_off_plan (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  scope         text not null check (scope in ('household', 'individual')),
  profile_id    uuid references public.profile (id) on delete cascade,  -- si scope individual
  off_date      date not null,
  created_at    timestamptz not null default now(),
  check (scope = 'household' or profile_id is not null)
);
create index day_off_plan_household_date_idx on public.day_off_plan (household_id, off_date);

-- ConsommationRéelle : quantité réellement consommée par UN profil pour un repas.
-- Indépendante du planifié (principe n°1 : confirmation par défaut, écart signalé).
-- Chaque participant a sa propre ligne -> ses propres macros.
create table public.real_consumption (
  id                uuid primary key default gen_random_uuid(),
  planned_meal_id   uuid references public.planned_meal (id) on delete cascade,
  profile_id        uuid not null references public.profile (id) on delete cascade,
  status            text not null default 'conforme'
                      check (status in ('conforme', 'different', 'skipped')),
  quantity_consumed numeric,
  quantity_unit     text,
  -- Cas "different" : ce qui a réellement été mangé à la place.
  actual_recipe_id  uuid references public.recipe (id) on delete set null,
  actual_free_text  text,
  consumed_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  check (planned_meal_id is not null or actual_recipe_id is not null or actual_free_text is not null)
);
create index real_consumption_profile_idx on public.real_consumption (profile_id, consumed_at);
create index real_consumption_meal_idx on public.real_consumption (planned_meal_id);

-- =============================================================================
-- OBJECTIFS & SUIVI NUTRITIONNEL PAR PROFIL (privé par défaut)
-- =============================================================================

-- Objectifs nutritionnels personnels, par nutriment et par période (extensible).
create table public.profile_goal (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profile (id) on delete cascade,
  nutrient_type_id  uuid not null references public.nutrient_type (id) on delete cascade,
  period            text not null default 'daily' check (period in ('daily', 'weekly')),
  target_min        numeric,
  target_max        numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (profile_id, nutrient_type_id, period)
);

-- ProfilNutrimentSuivi : nutriments suivis activement au-delà de la liste de base.
create table public.profile_nutrient_tracking (
  profile_id        uuid not null references public.profile (id) on delete cascade,
  nutrient_type_id  uuid not null references public.nutrient_type (id) on delete cascade,
  primary key (profile_id, nutrient_type_id)
);

-- Partage volontaire des données nutritionnelles entre membres du foyer.
-- Présence d'une ligne = owner partage sa consommation/objectifs à viewer. Privé sinon.
create table public.nutrition_share (
  owner_profile_id   uuid not null references public.profile (id) on delete cascade,
  viewer_profile_id  uuid not null references public.profile (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (owner_profile_id, viewer_profile_id),
  check (owner_profile_id <> viewer_profile_id)
);

-- =============================================================================
-- STOCK (rattaché au Foyer)
-- =============================================================================

-- RegleConservation — RÉSERVÉE, non livrée en V1 (champ réservé dès maintenant).
create table public.conservation_rule (
  id             uuid primary key default gen_random_uuid(),
  food_category  text not null unique,
  unopened_days  integer,                                   -- durée avant ouverture
  opened_days    integer,                                   -- durée après ouverture
  created_at     timestamptz not null default now()
);

create table public.stock (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references public.household (id) on delete cascade,
  food_id                uuid references public.food (id) on delete set null,
  label                  text,                              -- pour un article sans food lié
  -- Suivi précis (quantité) OU simple présence/absence selon l'enjeu de l'article.
  tracking_mode          text not null default 'presence'
                           check (tracking_mode in ('quantity', 'presence')),
  quantity               numeric,                           -- si tracking_mode = quantity
  unit                   text,
  present                boolean not null default true,     -- si tracking_mode = presence
  -- RÉSERVÉ péremption : déduite automatiquement à la 1re consommation partielle.
  date_ouverture         timestamptz,
  conservation_rule_id   uuid references public.conservation_rule (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (food_id is not null or label is not null)
);
create index stock_household_idx on public.stock (household_id);

-- =============================================================================
-- LISTE DE COURSES
-- =============================================================================
-- La liste elle-même est CALCULÉE dynamiquement (besoins à venir − stock), jamais
-- stockée en dur. On ne persiste que : récurrents, ajouts manuels, état coché.

-- Liste récurrente : produits de base indépendants du plan (café, lait…).
create table public.shopping_recurring_item (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.household (id) on delete cascade,
  food_id           uuid references public.food (id) on delete set null,
  label             text,
  default_quantity  numeric,
  unit              text,
  created_at        timestamptz not null default now(),
  check (food_id is not null or label is not null)
);
create index shopping_recurring_household_idx on public.shopping_recurring_item (household_id);

-- Ajouts manuels hors-recette à la liste courante.
create table public.shopping_manual_item (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  label         text not null,
  quantity      numeric,
  unit          text,
  checked       boolean not null default false,
  added_at      timestamptz not null default now()
);
create index shopping_manual_household_idx on public.shopping_manual_item (household_id);

-- État coché/acheté des lignes générées dynamiquement (clé stable par article).
create table public.shopping_item_state (
  household_id  uuid not null references public.household (id) on delete cascade,
  item_key      text not null,                              -- ex. 'food:<uuid>' ou 'label:<texte>'
  checked       boolean not null default false,
  checked_at    timestamptz,
  primary key (household_id, item_key)
);

-- =============================================================================
-- IA — ConversationIA (RÉSERVÉE, non livrée en V1)
-- =============================================================================
create table public.conversation_ia (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profile (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'system')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index conversation_ia_profile_idx on public.conversation_ia (profile_id, created_at);

-- =============================================================================
-- Triggers updated_at
-- =============================================================================
create trigger trg_household_updated     before update on public.household        for each row execute function public.set_updated_at();
create trigger trg_profile_updated       before update on public.profile          for each row execute function public.set_updated_at();
create trigger trg_recipe_updated        before update on public.recipe           for each row execute function public.set_updated_at();
create trigger trg_planned_meal_updated  before update on public.planned_meal     for each row execute function public.set_updated_at();
create trigger trg_profile_goal_updated  before update on public.profile_goal     for each row execute function public.set_updated_at();
create trigger trg_stock_updated         before update on public.stock            for each row execute function public.set_updated_at();
