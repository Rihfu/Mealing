-- =============================================================================
-- Mealing — Stock : boucle consommation → stock (marqueur d'idempotence)
-- =============================================================================
-- Principe n°1 : un repas planifié est mangé PAR DÉFAUT (sans action). La boucle
-- réconcilie les repas PASSÉS et décrémente le stock de leurs ingrédients liés au
-- catalogue (specs 3.4 : le stock baisse par CONSOMMATION, jamais par le planning).
--
-- `stock_applied_at` : horodatage de l'application au stock → IDEMPOTENCE (on ne
-- décrémente qu'une fois par repas) et base de l'ANNULATION. Additif, sans impact.
-- =============================================================================

alter table public.planned_meal add column if not exists stock_applied_at timestamptz;
