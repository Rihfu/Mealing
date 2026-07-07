-- N3 Nutrition — EXTRAS hors-plan (décision V1, § 8 de nutrition-refonte-audit.md) :
-- un aliment mangé en dehors du planning (goûter, yaourt, apéro) compté dans le
-- « réel estimé » en 2 gestes. Un extra = ligne `real_consumption` SANS repas
-- (`planned_meal_id` null), portant un aliment du catalogue (`food_id`) + quantité
-- dans l'unité de base de l'aliment (g/ml), ou une recette (`actual_recipe_id`).
-- Additif : l'app déployée continue de tourner (contraintes élargies, jamais durcies).

alter table public.real_consumption
  add column if not exists food_id uuid references public.food (id) on delete set null;

-- Statut « extra » (à côté de conforme/different/skipped).
alter table public.real_consumption drop constraint real_consumption_status_check;
alter table public.real_consumption add constraint real_consumption_status_check
  check (status in ('conforme', 'different', 'skipped', 'extra'));

-- La cible peut désormais aussi être un aliment seul.
alter table public.real_consumption drop constraint real_consumption_check;
alter table public.real_consumption add constraint real_consumption_check
  check (planned_meal_id is not null or actual_recipe_id is not null or actual_free_text is not null or food_id is not null);

create index if not exists real_consumption_food_idx on public.real_consumption (food_id);
