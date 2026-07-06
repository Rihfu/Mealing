-- N1 Nutrition : profil nutritionnel PRIVÉ (persona + infos corporelles optionnelles)
-- + table de référence AJR curée (ANSES, repères simplifiés) en lecture seule.

-- 1. Profil nutritionnel — table SÉPARÉE de `profile` car STRICTEMENT PRIVÉE :
--    `profile` est lisible par les membres du foyer (RLS profile_select), alors que
--    le persona (ex. « perte de poids ») et les infos corporelles ne doivent JAMAIS
--    être partagés par défaut (décision 2026-07-06, esprit `nutrition_share`).
create table if not exists public.nutrition_profile (
  profile_id uuid primary key references public.profile(id) on delete cascade,
  persona text check (persona in ('equilibre','sportif','perte_poids','vegetarien','enfant')),
  birth_year integer check (birth_year is null or birth_year between 1900 and 2100),
  sex text check (sex in ('male','female')),
  weight_kg numeric check (weight_kg is null or (weight_kg > 0 and weight_kg < 400)),
  height_cm numeric check (height_cm is null or (height_cm > 0 and height_cm < 260)),
  activity_level text check (activity_level in ('sedentaire','leger','modere','eleve')),
  onboarded_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.nutrition_profile is
  'Profil nutrition privé (persona + infos corporelles OPTIONNELLES). RLS : accessible uniquement par le profil lui-même — jamais par le foyer.';

alter table public.nutrition_profile enable row level security;
create policy nutrition_profile_select on public.nutrition_profile for select using (profile_id = auth.uid());
create policy nutrition_profile_insert on public.nutrition_profile for insert with check (profile_id = auth.uid());
create policy nutrition_profile_update on public.nutrition_profile for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy nutrition_profile_delete on public.nutrition_profile for delete using (profile_id = auth.uid());

-- 2. Références nutritionnelles CURÉES (AJR ANSES simplifiés, par âge/sexe).
--    LECTURE SEULE pour tout authentifié — AUCUNE policy d'écriture (leçon audit S3 :
--    pas de table de référence monde-écrivable). Ce sont des repères indicatifs,
--    pas un avis médical ; valeurs curées à la main, jamais générées (principe n°3).
create table if not exists public.nutrient_reference (
  id uuid primary key default gen_random_uuid(),
  nutrient_type_id uuid not null references public.nutrient_type(id) on delete cascade,
  sex text check (sex in ('male','female')), -- null = tous sexes
  age_min integer not null default 0,        -- bornes d'âge INCLUSES
  age_max integer not null default 999,
  target_min numeric,                        -- apport conseillé (RNP / AS)
  target_max numeric,                        -- limite haute quand pertinente
  source text not null default 'ANSES (repère simplifié)',
  note text,
  created_at timestamptz not null default now()
);
comment on table public.nutrient_reference is
  'AJR curés (ANSES, repères simplifiés) par âge/sexe. Lecture seule (aucune policy d''écriture) — structure extensible (principe n°8).';

alter table public.nutrient_reference enable row level security;
create policy nutrient_reference_select on public.nutrient_reference for select to authenticated using (true);

-- 3. Seed curé (par JOUR ; min = apport conseillé, max = limite indicative).
--    Idempotent : ne seed que si la table est vide.
with nt as (select id, code from public.nutrient_type)
insert into public.nutrient_reference (nutrient_type_id, sex, age_min, age_max, target_min, target_max, note)
select nt.id, v.sex, v.age_min, v.age_max, v.tmin, v.tmax, v.note
from (values
  -- Énergie (repères moyens : utilisés SANS infos corporelles ; jamais affichée en mode enfant)
  ('energy_kcal', 'male',   18, 59,  2300, 2700, 'repère adulte, activité modérée'),
  ('energy_kcal', 'female', 18, 59,  1800, 2200, 'repère adulte, activité modérée'),
  ('energy_kcal', 'male',   60, 999, 2000, 2400, null),
  ('energy_kcal', 'female', 60, 999, 1600, 2000, null),
  -- Protéines (RNP ~0,83 g/kg adulte → repères absolus ; affinés en g/kg si poids connu)
  ('protein', 'male',   18, 999, 62, null, 'RNP 0,83 g/kg — repère ~75 kg'),
  ('protein', 'female', 18, 999, 52, null, 'RNP 0,83 g/kg — repère ~62 kg'),
  ('protein', null, 1, 3,   10, null, null),
  ('protein', null, 4, 10,  20, null, null),
  ('protein', null, 11, 17, 45, null, null),
  -- Fibres (AS)
  ('fiber', null, 18, 999, 30, null, 'AS adulte'),
  ('fiber', null, 1, 3,   10, null, null),
  ('fiber', null, 4, 10,  15, null, null),
  ('fiber', null, 11, 17, 22, null, null),
  -- Sucres totaux (hors lactose) — limites
  ('sugars', null, 18, 999, null, 100, 'limite ANSES adulte'),
  ('sugars', null, 11, 17,  null, 75, null),
  ('sugars', null, 4, 10,   null, 60, null),
  ('sugars', null, 1, 3,    null, 50, null),
  -- Sodium — limites indicatives
  ('sodium', null, 18, 999, null, 2300, E'≈ 5,8 g de sel'),
  ('sodium', null, 11, 17,  null, 2000, null),
  ('sodium', null, 4, 10,   null, 1500, null),
  ('sodium', null, 1, 3,    null, 1200, null),
  -- Fer (RNP)
  ('iron', 'male',   18, 999, 11, null, null),
  ('iron', 'female', 18, 49,  16, null, 'pertes menstruelles'),
  ('iron', 'female', 50, 999, 11, null, null),
  ('iron', null, 1, 3,  5, null, null),
  ('iron', null, 4, 10, 7, null, null),
  ('iron', 'male',   11, 17, 11, null, null),
  ('iron', 'female', 11, 17, 13, null, null),
  -- Calcium (RNP)
  ('calcium', null, 18, 24,  1000, null, null),
  ('calcium', null, 25, 999, 950,  null, null),
  ('calcium', null, 1, 3,    450,  null, null),
  ('calcium', null, 4, 10,   800,  null, null),
  ('calcium', null, 11, 17,  1150, null, null),
  -- Vitamine D (RNP adulte / AS enfant)
  ('vitamin_d', null, 1, 999, 15, null, null),
  -- Vitamine B12 (AS)
  ('vitamin_b12', null, 18, 999, 4,   null, null),
  ('vitamin_b12', null, 1, 3,    1.5, null, null),
  ('vitamin_b12', null, 4, 10,   2.5, null, null),
  ('vitamin_b12', null, 11, 17,  3.5, null, null)
) as v(code, sex, age_min, age_max, tmin, tmax, note)
join nt on nt.code = v.code
where not exists (select 1 from public.nutrient_reference);
