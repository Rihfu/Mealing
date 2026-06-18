-- =============================================================================
-- Mealing — Courses : prix optionnel sur les articles d'un relevé (stats dépenses)
-- =============================================================================
-- Prix payé pour une ligne de relevé (TOTAL de la ligne, ex. 2 L de lait = 3,20 €),
-- OPTIONNEL. Saisissable au checkout et éditable ensuite dans le relevé. Sert aux
-- statistiques de dépenses (panier moyen €, dépense par rayon) — calculées seulement
-- quand des prix existent. Aucune autre logique ne dépend de ce champ.
--
-- (La rétention de l'historique passe de 1 à 6 mois côté applicatif — pas de DDL.)
-- =============================================================================

alter table public.shopping_trip_item
  add column if not exists price numeric;
