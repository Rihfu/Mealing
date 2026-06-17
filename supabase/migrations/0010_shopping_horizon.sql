-- =============================================================================
-- Mealing — Chantier H : cadence de courses configurable
-- =============================================================================
-- Remplace la fenêtre de calcul figée à 14 jours par un réglage du foyer
-- (nombre de jours d'horizon). Ex. 3 = plusieurs fois/semaine, 7 = hebdo,
-- 14 = bi-hebdo. Partagé au niveau foyer ; modifiable par tout membre
-- (cf. policy household_update = is_household_member). Additif, défaut = 14
-- (comportement actuel inchangé).
-- =============================================================================

alter table public.household
  add column if not exists shopping_horizon_days integer not null default 14
  check (shopping_horizon_days > 0);
