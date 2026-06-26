-- Portions planifiées d'un repas (nombre de parts à préparer).
-- Permet de dimensionner une recette au planning (invités), de scaler la nutrition
-- planifiée et la décrémentation de stock. Nullable : null = portions de base de la
-- recette (rétro-compatible avec les repas existants).
alter table public.planned_meal
  add column if not exists servings numeric check (servings is null or servings > 0);

comment on column public.planned_meal.servings is
  'Nombre de portions planifiées (recette dimensionnée pour ce repas). NULL = portions de base de la recette.';
