-- N3+ Nutrition — LONGUE TRAÎNE (§ 5 bis de nutrition-suivis-personnalises-design.md) :
-- catalogue étendu de nutriments pré-mappés USDA/OFF, CACHÉS par défaut
-- (is_base = false → absents des listes par défaut), trouvables via la recherche
-- de « Mes suivis ». Aucune règle de recommandation à anticiper : l'utilisateur
-- spécifique (« mon médecin m'a dit de surveiller le potassium ») se sert lui-même.
-- Repères ANSES curés quand ils existent ; sans repère → mode observation / cible perso.

insert into public.nutrient_type (code, name, unit, category, is_base)
values
  ('potassium', 'Potassium', 'mg', 'micro', false),
  ('vitamin_c', 'Vitamine C', 'mg', 'micro', false),
  ('vitamin_e', 'Vitamine E', 'mg', 'micro', false),
  ('vitamin_k', 'Vitamine K', 'µg', 'micro', false),
  ('vitamin_a', 'Vitamine A', 'µg', 'micro', false),
  ('vitamin_b6', 'Vitamine B6', 'mg', 'micro', false),
  ('folate', 'Folates (B9)', 'µg', 'micro', false),
  ('selenium', 'Sélénium', 'µg', 'micro', false),
  ('iodine', 'Iode', 'µg', 'micro', false),
  ('copper', 'Cuivre', 'mg', 'micro', false),
  ('manganese', 'Manganèse', 'mg', 'micro', false),
  ('phosphorus', 'Phosphore', 'mg', 'micro', false),
  ('saturated_fat', 'Acides gras saturés', 'g', 'macro', false),
  ('cholesterol', 'Cholestérol', 'mg', 'micro', false)
on conflict (code) do nothing;

-- Repères ANSES simplifiés (adultes ; min = RNP/AS, max = limite quand pertinente).
with nt as (select id, code from public.nutrient_type)
insert into public.nutrient_reference (nutrient_type_id, sex, age_min, age_max, target_min, target_max, note)
select nt.id, v.sex, v.age_min, v.age_max, v.tmin::numeric, v.tmax::numeric, v.note
from (values
  ('potassium', null, 18, 999, 3500, null, 'AS adulte'),
  ('vitamin_c', null, 18, 999, 110, null, 'RNP adulte'),
  ('vitamin_e', 'male',   18, 999, 10, null, 'AS adulte'),
  ('vitamin_e', 'female', 18, 999, 9,  null, 'AS adulte'),
  ('vitamin_k', null, 18, 999, 79, null, 'AS adulte (K1)'),
  ('vitamin_a', 'male',   18, 999, 750, null, 'RNP adulte'),
  ('vitamin_a', 'female', 18, 999, 650, null, 'RNP adulte'),
  ('vitamin_b6', 'male',   18, 999, 1.7, null, 'RNP adulte'),
  ('vitamin_b6', 'female', 18, 999, 1.6, null, 'RNP adulte'),
  ('folate', null, 18, 999, 330, null, 'RNP adulte'),
  ('selenium', null, 18, 999, 70, null, 'AS adulte'),
  ('iodine', null, 18, 999, 150, null, 'AS adulte'),
  ('copper', 'male',   18, 999, 1.9, null, 'AS adulte'),
  ('copper', 'female', 18, 999, 1.5, null, 'AS adulte'),
  ('manganese', null, 18, 999, 2.5, null, 'AS adulte'),
  ('phosphorus', null, 18, 999, 550, null, 'RNP adulte')
) as v(code, sex, age_min, age_max, tmin, tmax, note)
join nt on nt.code = v.code
where not exists (
  select 1 from public.nutrient_reference r where r.nutrient_type_id = nt.id
);
