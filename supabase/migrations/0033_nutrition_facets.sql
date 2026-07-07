-- N1.5 Nutrition — PIVOT facettes (remplace les personas comme concept central).
-- Doc de référence : docs/nutrition-suivis-personnalises-design.md
--
-- Modèle : FACETTES (multi-sélection) → MOTEUR DE RÈGLES CURÉ (table lecture seule)
-- → PLAN DE SUIVI (quantitatif = jauge, ou HABITUDE = occurrences comptées depuis le
-- planning). Tout additif — l'app déployée tourne sans impact.
--
-- Garde-fous : référentiels (facet/habit_type/tracking_rule/food_group) en LECTURE
-- SEULE (leçon audit S3, comme nutrient_reference) ; tables de profil en RLS
-- strictement personnelle (comme nutrition_profile) ; valeurs nutritionnelles jamais
-- inventées (n°3) — les règles ne portent que des repères sourcés, pas des chiffres.

/* ---------------------------------------------------------------------------
   0. Mode enfant : propriété du profil (le persona 'enfant' devient legacy).
--------------------------------------------------------------------------- */
alter table public.nutrition_profile
  add column if not exists is_child boolean not null default false;
update public.nutrition_profile set is_child = true where persona = 'enfant' and is_child = false;

/* ---------------------------------------------------------------------------
   1. Nouveaux nutriments quantitatifs : magnésium & zinc (USDA les couvre).
      Oméga-3 : traité en HABITUDE (poisson gras) — aucune base ne donne un
      « oméga-3 total » fiable ; la formulation ANSES est elle-même une habitude.
--------------------------------------------------------------------------- */
insert into public.nutrient_type (code, name, unit, category, is_base)
values
  ('magnesium', 'Magnésium', 'mg', 'micro', true),
  ('zinc', 'Zinc', 'mg', 'micro', true)
on conflict (code) do nothing;

-- Repères ANSES (RNP) pour les cibles proposées par computeNutritionTargets.
with nt as (select id, code from public.nutrient_type)
insert into public.nutrient_reference (nutrient_type_id, sex, age_min, age_max, target_min, target_max, note)
select nt.id, v.sex, v.age_min, v.age_max, v.tmin::numeric, v.tmax::numeric, v.note
from (values
  ('magnesium', 'male',   18, 999, 380, null, 'RNP adulte'),
  ('magnesium', 'female', 18, 999, 300, null, 'RNP adulte'),
  ('magnesium', null, 4, 10,  200, null, null),
  ('magnesium', null, 11, 17, 300, null, null),
  ('zinc', 'male',   18, 999, 11, null, 'RNP adulte (apport phytates moyen)'),
  ('zinc', 'female', 18, 999, 8,  null, 'RNP adulte (apport phytates moyen)'),
  ('zinc', null, 4, 10,  7,  null, null),
  ('zinc', null, 11, 17, 10, null, null)
) as v(code, sex, age_min, age_max, tmin, tmax, note)
join nt on nt.code = v.code
where not exists (
  select 1 from public.nutrient_reference r where r.nutrient_type_id = nt.id
);

/* ---------------------------------------------------------------------------
   2. Facettes (référentiel curé, lecture seule) + choix du profil (RLS perso).
--------------------------------------------------------------------------- */
create table if not exists public.facet (
  key text primary key,
  label text not null,
  groupe text not null check (groupe in ('activite','alimentation','objectif')),
  ordre integer not null default 0
);
comment on table public.facet is 'Référentiel de facettes (activités/alimentation/objectifs). Lecture seule.';
alter table public.facet enable row level security;
create policy facet_select on public.facet for select to authenticated using (true);

insert into public.facet (key, label, groupe, ordre) values
  ('sport_force', 'Muscu / force', 'activite', 1),
  ('sport_impact', 'Course & impact', 'activite', 2),
  ('sport_endurance', 'Endurance', 'activite', 3),
  ('travail_cognitif', 'Études / travail intellectuel', 'activite', 4),
  ('metier_physique', 'Métier physique', 'activite', 5),
  ('sedentaire', 'Plutôt sédentaire', 'activite', 6),
  ('fatigue', 'Souvent fatigué·e', 'activite', 7),
  ('vegetarien', 'Végétarien·ne', 'alimentation', 1),
  ('vegan', 'Végan·e', 'alimentation', 2),
  ('peu_poisson', 'Peu de poisson', 'alimentation', 3),
  ('peu_laitages', 'Peu de laitages', 'alimentation', 4),
  ('obj_equilibre', 'Équilibre', 'objectif', 1),
  ('obj_poids', 'Perte de poids douce', 'objectif', 2),
  ('obj_muscle', 'Muscle / perf', 'objectif', 3),
  ('obj_articulations', 'Articulations', 'objectif', 4),
  ('obj_memoire', 'Mémoire & concentration', 'objectif', 5),
  ('obj_energie', 'Énergie', 'objectif', 6),
  ('obj_immunite', 'Immunité', 'objectif', 7),
  ('obj_longevite', 'Vieillir en forme', 'objectif', 8)
on conflict (key) do nothing;

create table if not exists public.profile_facet (
  profile_id uuid not null references public.profile(id) on delete cascade,
  facet_key text not null references public.facet(key) on delete cascade,
  primary key (profile_id, facet_key)
);
comment on table public.profile_facet is 'Facettes cochées par un profil. RLS strictement personnelle.';
alter table public.profile_facet enable row level security;
create policy profile_facet_select on public.profile_facet for select using (profile_id = auth.uid());
create policy profile_facet_insert on public.profile_facet for insert with check (profile_id = auth.uid());
create policy profile_facet_delete on public.profile_facet for delete using (profile_id = auth.uid());

/* ---------------------------------------------------------------------------
   3. Types d'habitudes (référentiel) + suivis d'habitude du profil (RLS perso).
--------------------------------------------------------------------------- */
create table if not exists public.habit_type (
  key text primary key,
  label text not null,
  description text,
  target_count integer not null default 1,
  period text not null check (period in ('day','week')),
  match_tags text[] not null default '{}',
  distinct_mode boolean not null default false, -- true = aliments DISTINCTS (variété)
  ordre integer not null default 0
);
comment on table public.habit_type is 'Référentiel d''habitudes (occurrences comptées depuis le planning). Lecture seule.';
alter table public.habit_type enable row level security;
create policy habit_type_select on public.habit_type for select to authenticated using (true);

insert into public.habit_type (key, label, description, target_count, period, match_tags, distinct_mode, ordre) values
  ('poisson_gras', 'Poisson gras', 'Repère ANSES : poisson 2×/semaine, dont un gras.', 2, 'week', array['poisson_gras'], false, 1),
  ('legumineuse', 'Légumineuses', 'Fibres et protéines végétales — au moins 2×/semaine.', 2, 'week', array['legumineuse'], false, 2),
  ('fruits_legumes', 'Fruits & légumes', 'Le repère universel PNNS : 5 par jour.', 5, 'day', array['fruit','legume'], false, 3),
  ('collagene', 'Sources de collagène', 'Bouillons, plats mijotés gélatineux — au moins 1×/semaine.', 1, 'week', array['source_collagene'], false, 4),
  ('noix', 'Noix & graines', 'Oméga-3 d''origine végétale — une petite poignée par jour.', 1, 'day', array['noix_graine'], false, 5),
  ('variete_legumes', 'Variété de légumes', 'Des légumes DIFFÉRENTS au fil de la semaine.', 4, 'week', array['legume'], true, 6)
on conflict (key) do nothing;

create table if not exists public.profile_habit_tracking (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile(id) on delete cascade,
  habit_key text references public.habit_type(key) on delete cascade, -- null si 100 % custom
  custom_label text,
  direction text not null default 'min' check (direction in ('min','max')),
  target_count integer not null default 1,
  period text not null default 'week' check (period in ('day','week')),
  match_tags text[] not null default '{}',
  match_food_ids uuid[] not null default '{}',
  distinct_mode boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.profile_habit_tracking is 'Habitudes suivies par un profil (référencées OU 100 % custom). RLS strictement personnelle.';
-- Un même type d'habitude n'est suivi qu'une fois par profil.
create unique index if not exists profile_habit_tracking_unique
  on public.profile_habit_tracking (profile_id, habit_key) where habit_key is not null;
alter table public.profile_habit_tracking enable row level security;
create policy profile_habit_select on public.profile_habit_tracking for select using (profile_id = auth.uid());
create policy profile_habit_insert on public.profile_habit_tracking for insert with check (profile_id = auth.uid());
create policy profile_habit_update on public.profile_habit_tracking for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy profile_habit_delete on public.profile_habit_tracking for delete using (profile_id = auth.uid());

/* ---------------------------------------------------------------------------
   4. Moteur de règles CURÉ (lecture seule) : facettes → suivi + « pourquoi ».
      required_facets = ET (le OU s'exprime par plusieurs règles). Plafond &
      dédoublonnage par cible côté moteur. priority = paliers (10 risque de
      carence > 20 objectif > 30 confort).
--------------------------------------------------------------------------- */
create table if not exists public.tracking_rule (
  id uuid primary key default gen_random_uuid(),
  required_facets text[] not null default '{}',
  sex text check (sex in ('male','female')),
  age_min integer,
  age_max integer,
  kind text not null check (kind in ('nutrient','habit')),
  nutrient_code text,
  habit_key text,
  why_text text not null,
  priority integer not null default 20,
  child_only boolean not null default false,
  constraint tracking_rule_target check (
    (kind = 'nutrient' and nutrient_code is not null) or
    (kind = 'habit' and habit_key is not null)
  )
);
comment on table public.tracking_rule is 'Règles curées facettes→suivi (le « pourquoi » sourcé). Lecture seule (leçon S3).';
alter table public.tracking_rule enable row level security;
create policy tracking_rule_select on public.tracking_rule for select to authenticated using (true);

insert into public.tracking_rule (required_facets, sex, age_min, age_max, kind, nutrient_code, habit_key, why_text, priority, child_only) values
  -- Risque de carence (palier 10)
  (array['vegetarien'], null, null, null, 'nutrient', 'vitamin_b12', null, 'La vitamine B12 est surtout présente dans les produits animaux.', 10, false),
  (array['vegetarien'], null, null, null, 'nutrient', 'iron', null, 'Le fer végétal est moins bien absorbé — un œil dessus aide.', 10, false),
  (array['vegan'], null, null, null, 'nutrient', 'vitamin_b12', null, 'Sans aucun produit animal, la B12 mérite une attention particulière.', 10, false),
  (array['vegan'], null, null, null, 'nutrient', 'iron', null, 'Le fer d''origine végétale est moins bien absorbé.', 10, false),
  (array['vegan'], null, null, null, 'nutrient', 'calcium', null, 'Sans laitages, le calcium vient d''autres sources à surveiller.', 10, false),
  (array['peu_laitages'], null, null, null, 'nutrient', 'calcium', null, 'Les laitages sont le principal vecteur de calcium — écartés, on veille ailleurs.', 10, false),
  (array[]::text[], 'female', 18, 50, 'nutrient', 'iron', null, 'Les pertes menstruelles augmentent les besoins en fer.', 10, false),
  -- Objectifs (palier 20)
  (array['sport_force'], null, null, null, 'nutrient', 'protein', null, 'Construction et réparation musculaires.', 20, false),
  (array['obj_muscle'], null, null, null, 'nutrient', 'protein', null, 'Soutenir la construction musculaire.', 20, false),
  (array['sport_endurance'], null, null, null, 'nutrient', 'carbs', null, 'Les glucides sont le carburant de l''effort long.', 20, false),
  (array['sport_endurance'], null, null, null, 'nutrient', 'iron', null, 'L''endurance augmente les besoins en fer (hémolyse d''effort).', 20, false),
  (array['travail_cognitif'], null, null, null, 'habit', null, 'poisson_gras', 'Le DHA du poisson gras participe au fonctionnement normal du cerveau.', 20, false),
  (array['obj_memoire'], null, null, null, 'habit', null, 'poisson_gras', 'Les oméga-3 du poisson gras soutiennent la mémoire et la concentration.', 20, false),
  (array['peu_poisson'], null, null, null, 'habit', null, 'noix', 'Les noix et l''huile de colza apportent des oméga-3 sans poisson.', 20, false),
  (array['obj_poids'], null, null, null, 'nutrient', 'protein', null, 'Les protéines rassasient — utile pour un déficit tenable.', 20, false),
  (array['obj_poids'], null, null, null, 'nutrient', 'sugars', null, 'Garder un œil sur les sucres aide un déficit doux.', 20, false),
  (array['obj_energie'], null, null, null, 'nutrient', 'magnesium', null, 'Le magnésium contribue à réduire la fatigue.', 20, false),
  (array['fatigue'], null, null, null, 'nutrient', 'magnesium', null, 'Le magnésium contribue à réduire la fatigue.', 20, false),
  (array['fatigue'], null, null, null, 'nutrient', 'iron', null, 'Un fer bas est une cause fréquente de fatigue.', 20, false),
  (array['obj_immunite'], null, null, null, 'nutrient', 'vitamin_d', null, 'La vitamine D participe au fonctionnement du système immunitaire.', 20, false),
  (array['obj_immunite'], null, null, null, 'nutrient', 'zinc', null, 'Le zinc contribue au fonctionnement normal du système immunitaire.', 20, false),
  (array['obj_longevite'], null, null, null, 'nutrient', 'protein', null, 'Préserver la masse musculaire avec l''âge (sarcopénie).', 20, false),
  (array['obj_longevite'], null, null, null, 'nutrient', 'fiber', null, 'Les fibres nourrissent un microbiote diversifié.', 20, false),
  -- Articulations & endurance : confort (palier 30)
  (array['sport_impact'], null, null, null, 'habit', null, 'collagene', 'Les sports d''impact sollicitent tendons et cartilages ; certains sportifs veillent à leurs sources de collagène.', 30, false),
  (array['obj_articulations'], null, null, null, 'habit', null, 'collagene', 'Bouillons et plats mijotés apportent le collagène qui soutient le confort articulaire.', 30, false),
  (array['obj_articulations'], null, null, null, 'habit', null, 'poisson_gras', 'Les oméga-3 sont associés au confort articulaire.', 30, false),
  -- Âge (palier 10) — required_facets vide + filtre d'âge
  (array[]::text[], null, 60, null, 'nutrient', 'protein', null, 'Après 60 ans, préserver la masse musculaire demande plus de protéines.', 10, false),
  (array[]::text[], null, 60, null, 'nutrient', 'calcium', null, 'Le calcium et la vitamine D protègent les os avec l''âge.', 10, false),
  (array[]::text[], null, 60, null, 'nutrient', 'vitamin_d', null, 'La vitamine D soutient l''absorption du calcium et les os.', 10, false),
  -- Socle universel (palier 25) — proposé à tous
  (array[]::text[], null, null, null, 'habit', null, 'fruits_legumes', 'Le repère universel : 5 fruits et légumes par jour.', 25, false),
  (array[]::text[], null, null, null, 'nutrient', 'fiber', null, 'Les fibres, socle d''une alimentation équilibrée.', 25, false),
  -- Enfant (child_only) — JAMAIS de kcal
  (array[]::text[], null, null, null, 'habit', null, 'variete_legumes', 'Découvrir des légumes différents, sans comptage ni pression.', 15, true),
  (array[]::text[], null, null, null, 'nutrient', 'calcium', null, 'Le calcium accompagne la croissance des os.', 15, true),
  (array[]::text[], null, null, null, 'nutrient', 'iron', null, 'Le fer soutient la croissance.', 15, true);

/* ---------------------------------------------------------------------------
   5. Tags d'aliments (groupes) — seed curé du catalogue FR.
      food_tag insérable par authentifié (l'IA tague un nouvel aliment à sa
      création, comme food.category — valeurs nutritionnelles jamais touchées).
--------------------------------------------------------------------------- */
create table if not exists public.food_group (
  tag text primary key,
  label text not null
);
alter table public.food_group enable row level security;
create policy food_group_select on public.food_group for select to authenticated using (true);
insert into public.food_group (tag, label) values
  ('poisson_gras', 'Poisson gras'),
  ('legumineuse', 'Légumineuses'),
  ('fruit', 'Fruits'),
  ('legume', 'Légumes'),
  ('noix_graine', 'Noix & graines'),
  ('source_collagene', 'Sources de collagène'),
  ('fermente', 'Aliments fermentés')
on conflict (tag) do nothing;

create table if not exists public.food_tag (
  food_id uuid not null references public.food(id) on delete cascade,
  tag text not null references public.food_group(tag) on delete cascade,
  primary key (food_id, tag)
);
comment on table public.food_tag is 'Groupes d''aliments (pour compter les habitudes). Seed curé + tag IA best-effort à la création (classement factuel, pas les valeurs).';
alter table public.food_tag enable row level security;
create policy food_tag_select on public.food_tag for select to authenticated using (true);
-- Insérable par authentifié (tag à la création d'un aliment, comme food.category).
create policy food_tag_insert on public.food_tag for insert to authenticated with check (true);

-- Seed : rattache par external_id de catalogue (cat:<slug>). Idempotent.
insert into public.food_tag (food_id, tag)
select f.id, m.tag
from public.food f
join (values
  -- Poisson gras
  ('cat:saumon','poisson_gras'),('cat:maquereau','poisson_gras'),('cat:filet-de-maquerau','poisson_gras'),
  ('cat:sardine','poisson_gras'),('cat:sardines-boite','poisson_gras'),('cat:truite','poisson_gras'),
  ('cat:thon-boite','poisson_gras'),('cat:filet-de-thon','poisson_gras'),('cat:anchois','poisson_gras'),
  -- Légumineuses (légumes secs)
  ('cat:lentilles','legumineuse'),('cat:pois-chiches','legumineuse'),('cat:haricots-blancs','legumineuse'),
  ('cat:haricots-rouges','legumineuse'),('cat:flageolets','legumineuse'),('cat:feve','legumineuse'),
  -- Fruits
  ('cat:abricot','fruit'),('cat:ananas','fruit'),('cat:banane','fruit'),('cat:cerise','fruit'),
  ('cat:clementine','fruit'),('cat:figue','fruit'),('cat:fraise','fruit'),('cat:framboise','fruit'),
  ('cat:grenade','fruit'),('cat:kiwi','fruit'),('cat:mandarine','fruit'),('cat:mangue','fruit'),
  ('cat:melon','fruit'),('cat:myrtille','fruit'),('cat:nectarine','fruit'),('cat:orange','fruit'),
  ('cat:pamplemousse','fruit'),('cat:pasteque','fruit'),('cat:peche','fruit'),('cat:poire','fruit'),
  ('cat:pomme','fruit'),('cat:prune','fruit'),('cat:raisin','fruit'),('cat:raisin-noir','fruit'),
  ('cat:rhubarbe','fruit'),('cat:fruits-surgeles','fruit'),
  -- Légumes
  ('cat:artichaut','legume'),('cat:asperge','legume'),('cat:aubergine','legume'),('cat:betterave','legume'),
  ('cat:blette','legume'),('cat:brocoli','legume'),('cat:butternut','legume'),('cat:carotte','legume'),
  ('cat:celeri','legume'),('cat:celeri-rave','legume'),('cat:champignon','legume'),('cat:chou','legume'),
  ('cat:chou-bruxelles','legume'),('cat:chou-fleur','legume'),('cat:chou-rouge','legume'),('cat:concombre','legume'),
  ('cat:courge','legume'),('cat:courgette','legume'),('cat:endive','legume'),('cat:epinards','legume'),
  ('cat:fenouil','legume'),('cat:haricots-verts','legume'),('cat:mache','legume'),('cat:navet','legume'),
  ('cat:panais','legume'),('cat:patate-douce','legume'),('cat:petits-pois','legume'),('cat:poireau','legume'),
  ('cat:poivron','legume'),('cat:potiron','legume'),('cat:radis','legume'),('cat:roquette','legume'),
  ('cat:salade','legume'),('cat:tomate','legume'),('cat:tomate-cerise','legume'),
  ('cat:epinards-surgeles','legume'),('cat:legumes-surgeles','legume'),('cat:petits-pois-surgeles','legume'),
  ('cat:poelee-legumes','legume'),
  -- Complément de curation (2026-07-07) : aromates-légumes + tomates en conserve
  -- (le PNNS les compte ; sans eux une bolognaise ne comptait aucun légume).
  ('cat:oignon','legume'),('cat:oignon-rouge','legume'),('cat:ail','legume'),('cat:echalote','legume'),
  ('cat:tomates-concassees','legume'),('cat:tomates-concassees-boite','legume'),('cat:tomates-pelees','legume'),
  ('cat:coulis-tomate','legume'),('cat:mais','legume'),('cat:mais-boite','legume'),
  -- Noix & graines
  ('cat:noix','noix_graine'),('cat:noisettes','noix_graine'),('cat:amandes','noix_graine'),
  ('cat:cacahuetes','noix_graine'),('cat:pignons','noix_graine'),
  -- Sources de collagène
  ('cat:gelatine','source_collagene'),('cat:bouillon-boeuf','source_collagene'),
  ('cat:bouillon-volaille','source_collagene'),('cat:fond-veau','source_collagene'),
  -- Fermentés (pour le constructeur d'habitude)
  ('cat:yaourt-nature','fermente'),('cat:yaourt-grec','fermente'),('cat:skyr','fermente'),
  ('cat:fromage-blanc','fermente')
) as m(ext, tag) on f.external_id = m.ext and f.source = 'manual'
on conflict do nothing;
