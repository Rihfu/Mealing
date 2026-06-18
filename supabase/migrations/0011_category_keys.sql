-- =============================================================================
-- Mealing — Rayons : food.category passe des libellés d'affichage à des CLÉS stables
-- =============================================================================
-- Avant : food.category stockait un libellé d'affichage (« Crémerie & œufs »…) qui
-- devait correspondre exactement au libellé codé dans src/lib/product-assets.tsx.
-- Ce couplage avait dérivé : 4 rayons sur 8 ne correspondaient plus → ~29 aliments
-- tombaient dans « Autres ». On stocke désormais une CLÉ stable (cf. principe n°8 :
-- identifiant stable, libellé/teinte/ordre/icône dérivés côté UI). Le libellé n'est
-- plus dupliqué en base.
--
-- Idempotent : ne touche que les lignes encore exprimées en libellé. Sur une base
-- fraîche, s'exécute après 0009 (qui insère les libellés) et les convertit en clés.
-- =============================================================================

update public.food set category = case category
  when 'Fruits & légumes'   then 'legumes'
  when 'Viandes & poissons' then 'proteines'
  when 'Crémerie & œufs'    then 'cremerie'
  when 'Pains & céréales'   then 'boulangerie'
  when 'Épicerie salée'     then 'epicerie'
  when 'Épicerie sucrée'    then 'sucre'
  when 'Surgelés'           then 'surgeles'
  when 'Boissons'           then 'boissons'
  else category
end
where category in (
  'Fruits & légumes', 'Viandes & poissons', 'Crémerie & œufs', 'Pains & céréales',
  'Épicerie salée', 'Épicerie sucrée', 'Surgelés', 'Boissons'
);
