-- 0023_stock_sort_index
-- Ordre MANUEL des articles au sein d'un lieu (drag-to-reorder du Stock).
-- Additive : colonne nullable, l'app déployée tourne sans impact. NULL = non ordonné
-- (repli sur created_at au rendu). L'ordre est attribué séquentiellement par lieu au dépôt.
alter table stock add column if not exists sort_index integer;

comment on column stock.sort_index is
  'Ordre manuel de l''article dans son lieu de conservation (glisser-déposer). NULL = non ordonné (repli created_at desc).';
