-- =============================================================================
-- Mealing — Chantier D : seed du catalogue d'aliments de base (FR)
-- =============================================================================
-- Petit catalogue curé d'aliments courants pour rendre l'autocomplétion utile
-- dès le départ (hors-ligne, en français) et amorcer le tri par rayon.
-- Identité stable : source 'manual', external_id = 'cat:<slug>'. Idempotent.
-- Périmètre volontairement borné (principe n°2) — extensible à l'usage et via
-- l'import USDA/OFF (peuplement paresseux).
-- Unités = codes de src/lib/units.ts (pièce, g, kg, ml, cl, L, paquet, sachet, botte, boîte).
-- =============================================================================

insert into public.food (name, source, external_id, default_unit, category) values
  -- Fruits & légumes
  ('Pomme',                'manual', 'cat:pomme',             'pièce', 'Fruits & légumes'),
  ('Banane',               'manual', 'cat:banane',            'pièce', 'Fruits & légumes'),
  ('Orange',               'manual', 'cat:orange',            'pièce', 'Fruits & légumes'),
  ('Citron',               'manual', 'cat:citron',            'pièce', 'Fruits & légumes'),
  ('Fraise',               'manual', 'cat:fraise',            'g',     'Fruits & légumes'),
  ('Avocat',               'manual', 'cat:avocat',            'pièce', 'Fruits & légumes'),
  ('Tomate',               'manual', 'cat:tomate',            'pièce', 'Fruits & légumes'),
  ('Pomme de terre',       'manual', 'cat:pomme-de-terre',    'kg',    'Fruits & légumes'),
  ('Carotte',              'manual', 'cat:carotte',           'pièce', 'Fruits & légumes'),
  ('Oignon',               'manual', 'cat:oignon',            'pièce', 'Fruits & légumes'),
  ('Échalote',             'manual', 'cat:echalote',          'pièce', 'Fruits & légumes'),
  ('Ail',                  'manual', 'cat:ail',               'pièce', 'Fruits & légumes'),
  ('Courgette',            'manual', 'cat:courgette',         'pièce', 'Fruits & légumes'),
  ('Poivron',              'manual', 'cat:poivron',           'pièce', 'Fruits & légumes'),
  ('Concombre',            'manual', 'cat:concombre',         'pièce', 'Fruits & légumes'),
  ('Salade',               'manual', 'cat:salade',            'pièce', 'Fruits & légumes'),
  ('Champignon',           'manual', 'cat:champignon',        'g',     'Fruits & légumes'),
  ('Brocoli',              'manual', 'cat:brocoli',           'pièce', 'Fruits & légumes'),
  ('Épinards',             'manual', 'cat:epinards',          'g',     'Fruits & légumes'),
  ('Haricots verts',       'manual', 'cat:haricots-verts',    'g',     'Fruits & légumes'),
  ('Persil',               'manual', 'cat:persil',            'botte', 'Fruits & légumes'),
  ('Basilic',              'manual', 'cat:basilic',           'botte', 'Fruits & légumes'),
  -- Crémerie & œufs
  ('Lait',                 'manual', 'cat:lait',              'L',     'Crémerie & œufs'),
  ('Œufs',                 'manual', 'cat:oeufs',             'pièce', 'Crémerie & œufs'),
  ('Beurre',               'manual', 'cat:beurre',            'g',     'Crémerie & œufs'),
  ('Crème fraîche',        'manual', 'cat:creme-fraiche',     'cl',    'Crémerie & œufs'),
  ('Yaourt nature',        'manual', 'cat:yaourt-nature',     'pièce', 'Crémerie & œufs'),
  ('Fromage râpé',         'manual', 'cat:fromage-rape',      'g',     'Crémerie & œufs'),
  ('Parmesan',             'manual', 'cat:parmesan',          'g',     'Crémerie & œufs'),
  ('Emmental',             'manual', 'cat:emmental',          'g',     'Crémerie & œufs'),
  ('Camembert',            'manual', 'cat:camembert',         'pièce', 'Crémerie & œufs'),
  ('Mozzarella',           'manual', 'cat:mozzarella',        'g',     'Crémerie & œufs'),
  -- Viandes & poissons
  ('Poulet',               'manual', 'cat:poulet',            'g',     'Viandes & poissons'),
  ('Bœuf haché',           'manual', 'cat:boeuf-hache',       'g',     'Viandes & poissons'),
  ('Steak',                'manual', 'cat:steak',             'pièce', 'Viandes & poissons'),
  ('Jambon',               'manual', 'cat:jambon',            'pièce', 'Viandes & poissons'),
  ('Lardons',              'manual', 'cat:lardons',           'g',     'Viandes & poissons'),
  ('Saumon',               'manual', 'cat:saumon',            'pièce', 'Viandes & poissons'),
  ('Filet de poisson',     'manual', 'cat:filet-poisson',     'pièce', 'Viandes & poissons'),
  ('Thon (boîte)',         'manual', 'cat:thon-boite',        'boîte', 'Viandes & poissons'),
  -- Épicerie salée
  ('Riz',                  'manual', 'cat:riz',               'g',     'Épicerie salée'),
  ('Pâtes',                'manual', 'cat:pates',             'g',     'Épicerie salée'),
  ('Semoule',              'manual', 'cat:semoule',           'g',     'Épicerie salée'),
  ('Quinoa',               'manual', 'cat:quinoa',            'g',     'Épicerie salée'),
  ('Farine',               'manual', 'cat:farine',            'g',     'Épicerie salée'),
  ('Lentilles',            'manual', 'cat:lentilles',         'g',     'Épicerie salée'),
  ('Pois chiches',         'manual', 'cat:pois-chiches',      'boîte', 'Épicerie salée'),
  ('Haricots rouges',      'manual', 'cat:haricots-rouges',   'boîte', 'Épicerie salée'),
  ('Tomates pelées',       'manual', 'cat:tomates-pelees',    'boîte', 'Épicerie salée'),
  ('Concentré de tomate',  'manual', 'cat:concentre-tomate',  'g',     'Épicerie salée'),
  ('Huile d''olive',       'manual', 'cat:huile-olive',       'ml',    'Épicerie salée'),
  ('Huile de tournesol',   'manual', 'cat:huile-tournesol',   'L',     'Épicerie salée'),
  ('Vinaigre',             'manual', 'cat:vinaigre',          'cl',    'Épicerie salée'),
  ('Sel',                  'manual', 'cat:sel',               'g',     'Épicerie salée'),
  ('Poivre',               'manual', 'cat:poivre',            'g',     'Épicerie salée'),
  ('Moutarde',             'manual', 'cat:moutarde',          'g',     'Épicerie salée'),
  ('Mayonnaise',           'manual', 'cat:mayonnaise',        'g',     'Épicerie salée'),
  ('Ketchup',              'manual', 'cat:ketchup',           'ml',    'Épicerie salée'),
  ('Bouillon (cube)',      'manual', 'cat:bouillon-cube',     'pièce', 'Épicerie salée'),
  -- Épicerie sucrée
  ('Sucre',                'manual', 'cat:sucre',             'g',     'Épicerie sucrée'),
  ('Chocolat',             'manual', 'cat:chocolat',          'g',     'Épicerie sucrée'),
  ('Confiture',            'manual', 'cat:confiture',         'g',     'Épicerie sucrée'),
  ('Miel',                 'manual', 'cat:miel',              'g',     'Épicerie sucrée'),
  ('Café',                 'manual', 'cat:cafe',              'g',     'Épicerie sucrée'),
  ('Thé',                  'manual', 'cat:the',               'sachet','Épicerie sucrée'),
  ('Céréales',             'manual', 'cat:cereales',          'g',     'Épicerie sucrée'),
  ('Biscuits',             'manual', 'cat:biscuits',          'paquet','Épicerie sucrée'),
  -- Pains & céréales
  ('Pain',                 'manual', 'cat:pain',              'pièce', 'Pains & céréales'),
  ('Pain de mie',          'manual', 'cat:pain-de-mie',       'paquet','Pains & céréales'),
  ('Levure',               'manual', 'cat:levure',            'sachet','Pains & céréales'),
  -- Boissons
  ('Eau',                  'manual', 'cat:eau',               'L',     'Boissons'),
  ('Jus d''orange',        'manual', 'cat:jus-orange',        'L',     'Boissons'),
  -- Surgelés
  ('Légumes surgelés',     'manual', 'cat:legumes-surgeles',  'g',     'Surgelés'),
  ('Frites surgelées',     'manual', 'cat:frites-surgelees',  'g',     'Surgelés'),
  ('Glace',                'manual', 'cat:glace',             'L',     'Surgelés'),
  ('Pizza',                'manual', 'cat:pizza',             'pièce', 'Surgelés')
on conflict (external_id) where source = 'manual' and external_id is not null
do update set
  name         = excluded.name,
  default_unit = excluded.default_unit,
  category     = excluded.category;

-- Conditionnements courants. On repart à zéro pour les items de catalogue
-- (idempotent ; food_package n'est référencé par rien).
delete from public.food_package
where food_id in (select id from public.food where source = 'manual' and external_id like 'cat:%');

insert into public.food_package (food_id, label, quantity, unit, is_default, position)
select f.id, p.label, p.quantity, p.unit, p.is_default, p.position
from (values
  ('cat:riz',          '1 kg',        1,   'kg',    true,  0),
  ('cat:riz',          '500 g',       500, 'g',     false, 1),
  ('cat:riz',          '5 kg',        5,   'kg',    false, 2),
  ('cat:pates',        '500 g',       500, 'g',     true,  0),
  ('cat:pates',        '1 kg',        1,   'kg',    false, 1),
  ('cat:farine',       '1 kg',        1,   'kg',    true,  0),
  ('cat:farine',       '5 kg',        5,   'kg',    false, 1),
  ('cat:sucre',        '1 kg',        1,   'kg',    true,  0),
  ('cat:sucre',        '500 g',       500, 'g',     false, 1),
  ('cat:sel',          '1 kg',        1,   'kg',    true,  0),
  ('cat:lentilles',    '500 g',       500, 'g',     true,  0),
  ('cat:lait',         '1 L',         1,   'L',     true,  0),
  ('cat:lait',         'pack de 6',   6,   'pièce', false, 1),
  ('cat:oeufs',        'boîte de 6',  6,   'pièce', true,  0),
  ('cat:oeufs',        'boîte de 12', 12,  'pièce', false, 1),
  ('cat:beurre',       '250 g',       250, 'g',     true,  0),
  ('cat:beurre',       '500 g',       500, 'g',     false, 1),
  ('cat:huile-olive',  '1 L',         1,   'L',     true,  0),
  ('cat:huile-olive',  '50 cl',       50,  'cl',    false, 1),
  ('cat:cafe',         '250 g',       250, 'g',     true,  0),
  ('cat:cafe',         '1 kg',        1,   'kg',    false, 1),
  ('cat:eau',          'pack de 6',   6,   'pièce', true,  0),
  ('cat:eau',          '1,5 L',       1.5, 'L',     false, 1),
  ('cat:yaourt-nature','pack de 4',   4,   'pièce', true,  0),
  ('cat:yaourt-nature','pack de 8',   8,   'pièce', false, 1),
  ('cat:lardons',      '200 g',       200, 'g',     true,  0),
  ('cat:fromage-rape', '200 g',       200, 'g',     true,  0),
  ('cat:pain-de-mie',  '500 g',       500, 'g',     true,  0),
  ('cat:cereales',     '500 g',       500, 'g',     true,  0)
) as p(slug, label, quantity, unit, is_default, position)
join public.food f on f.external_id = p.slug and f.source = 'manual';
