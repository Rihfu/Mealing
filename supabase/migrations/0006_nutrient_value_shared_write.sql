-- =============================================================================
-- Mealing — Valeurs nutritionnelles : écriture partagée (Phase 1)
-- =============================================================================
-- Les aliments (food) et leurs valeurs (nutrient_value) sont des DONNÉES DE
-- RÉFÉRENCE PARTAGÉES, alimentées par import depuis des fournisseurs fiables
-- (USDA, Open Food Facts). La policy initiale liait l'écriture des valeurs au
-- créateur de l'aliment, ce qui empêchait :
--   * l'import quand created_by n'était pas renseigné ;
--   * le ré-import par un autre membre du foyer.
-- On autorise donc tout utilisateur authentifié à écrire les valeurs (lecture
-- déjà ouverte aux authentifiés). Compromis acceptable pour un usage familial.
-- =============================================================================

drop policy if exists nutrient_value_write on public.nutrient_value;

create policy nutrient_value_write on public.nutrient_value
  for all
  to authenticated
  using (true)
  with check (true);
