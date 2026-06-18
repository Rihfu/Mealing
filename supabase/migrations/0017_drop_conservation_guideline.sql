-- =============================================================================
-- Mealing — Retrait de conservation_guideline (superseded)
-- =============================================================================
-- Décision (validée utilisateur) : la conservation de la fiche produit est estimée
-- par IA (par lieu de stockage, usages FR, indicative) plutôt que par une table
-- curée trop grossière (« Légumes frais » mélangeait poireau et pommes de terre).
-- La table 0016 n'est donc plus utilisée → on la retire. `conservation_rule` (0007)
-- reste en place (utilisée par getStockWithExpiry).
-- =============================================================================

drop table if exists public.conservation_guideline;
