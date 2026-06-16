-- =============================================================================
-- Mealing — Phase 3 : règles de conservation (point de départ type USDA FoodKeeper)
-- =============================================================================
-- Curation bornée mais réelle (specs §5) : durées indicatives au réfrigérateur,
-- en jours. unopened_days = avant ouverture ; opened_days = après ouverture.
-- NULL = non pertinent pour cette catégorie. Valeurs volontairement prudentes
-- (principe n°2 : précision approximative assumée — la conservation réelle dépend
-- du stockage). À affiner à l'usage.
-- =============================================================================

insert into public.conservation_rule (food_category, unopened_days, opened_days) values
  ('Légumes frais',                7,   null),
  ('Fruits frais',                 7,   null),
  ('Salade / verdure',             5,   null),
  ('Viande rouge crue',            4,   null),
  ('Volaille crue',                2,   null),
  ('Poisson frais',                2,   null),
  ('Charcuterie',                  14,  5),
  ('Lait',                         7,   4),
  ('Yaourt / laitage',             14,  null),
  ('Fromage à pâte dure',          28,  21),
  ('Fromage à pâte molle',         14,  7),
  ('Œufs',                         28,  null),
  ('Beurre',                       30,  30),
  ('Tofu',                         7,   3),
  ('Restes cuisinés',              null, 4),
  ('Conserve ouverte',             null, 4),
  ('Sauce / condiment',            null, 30),
  ('Jus de fruits frais',          7,   5),
  ('Pain',                         4,   null)
on conflict (food_category) do update
  set unopened_days = excluded.unopened_days,
      opened_days   = excluded.opened_days;
