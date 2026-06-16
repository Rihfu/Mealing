-- =============================================================================
-- Mealing — Données de référence : nutriments de base (specs 3.3)
-- =============================================================================
-- Énergie + macros prioritaires + liste micronutriments de base restreinte
-- (fer, calcium, vitamine D, vitamine B12, fibres, sucres, sodium).
-- is_base = true -> suivi par défaut pour tous les profils ; le reste est
-- activable par profil via profile_nutrient_tracking (sans changement de schéma).
--
-- Le mapping vers les numéros de nutriments USDA vit dans la couche fournisseur
-- (src/lib/providers/nutrition/usda.ts), par isolation (principe directeur n°5).
-- =============================================================================

insert into public.nutrient_type (code, name, unit, category, is_base) values
  ('energy_kcal',  'Énergie',        'kcal', 'energy', true),
  ('protein',      'Protéines',      'g',    'macro',  true),
  ('fat',          'Lipides',        'g',    'macro',  true),
  ('carbs',        'Glucides',       'g',    'macro',  true),
  ('sugars',       'Sucres',         'g',    'macro',  true),
  ('fiber',        'Fibres',         'g',    'macro',  true),
  ('sodium',       'Sodium',         'mg',   'micro',  true),
  ('iron',         'Fer',            'mg',   'micro',  true),
  ('calcium',      'Calcium',        'mg',   'micro',  true),
  ('vitamin_d',    'Vitamine D',     'µg',   'micro',  true),
  ('vitamin_b12',  'Vitamine B12',   'µg',   'micro',  true)
on conflict (code) do update
  set name = excluded.name,
      unit = excluded.unit,
      category = excluded.category,
      is_base = excluded.is_base;
