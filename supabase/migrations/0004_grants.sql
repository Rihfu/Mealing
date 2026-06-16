-- =============================================================================
-- Mealing — Privilèges de table (Phase 0)
-- =============================================================================
-- Le RLS (0002) restreint les LIGNES visibles, mais PostgreSQL exige en plus des
-- privilèges de TABLE pour le rôle. Les tables créées par la migration n'héritent
-- pas automatiquement des grants vers `authenticated` sur ce projet : on les
-- accorde explicitement (et on fixe les privilèges par défaut pour les futures
-- tables, afin que les phases suivantes en héritent sans y penser).
--
-- `anon` n'obtient rien : toute l'application est derrière l'authentification.
-- `service_role` contourne le RLS et dispose déjà de ses accès.
-- =============================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;

-- Les futures tables créées dans public hériteront de ces privilèges.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
