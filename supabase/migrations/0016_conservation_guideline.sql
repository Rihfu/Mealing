-- =============================================================================
-- Mealing — Conservation par CONDITION DE STOCKAGE, normes FR (fiche produit)
-- =============================================================================
-- `conservation_rule` (0007) ne donne que 2 durées (fermé / ouvert), sans tenir
-- compte du LIEU de stockage ni des spécificités FR (œufs hors frigo, lait UHT au
-- placard…) et reste calquée sur FoodKeeper (US). On ajoute une table de référence
-- plus fine (catégorie × stockage), curée pour la France. Durées INDICATIVES
-- (principe n°2) — curées à la main, jamais générées par IA (n°3).
--
-- `conservation_rule` est conservée telle quelle (utilisée par getStockWithExpiry).
-- Cette table sert la fiche produit (getConservationForFood).
-- =============================================================================

create table if not exists public.conservation_guideline (
  id            uuid primary key default gen_random_uuid(),
  food_category text not null,            -- même libellé que le pont nom→catégorie (food-conservation.ts)
  storage       text not null,            -- 'placard' | 'frigo' | 'congelateur'
  unopened_days integer,                  -- jours fermé / non entamé, dans ce stockage
  opened_days   integer,                  -- jours après ouverture, dans ce stockage
  note          text,                     -- précision FR (ex. « hors frigo en France »)
  position      integer not null default 0,
  unique (food_category, storage)
);
create index if not exists conservation_guideline_cat_idx on public.conservation_guideline (food_category);

alter table public.conservation_guideline enable row level security;
drop policy if exists conservation_guideline_select on public.conservation_guideline;
create policy conservation_guideline_select on public.conservation_guideline
  for select using (auth.role() = 'authenticated');
grant select on public.conservation_guideline to authenticated;

insert into public.conservation_guideline (food_category, storage, unopened_days, opened_days, note, position) values
  ('Volaille crue','frigo',2,1,'À cuire rapidement.',1),
  ('Volaille crue','congelateur',270,null,'Crue, bien emballée.',2),
  ('Viande rouge crue','frigo',3,2,null,1),
  ('Viande rouge crue','congelateur',270,null,null,2),
  ('Poisson frais','frigo',2,1,'Le plus frais possible.',1),
  ('Poisson frais','congelateur',180,null,null,2),
  ('Charcuterie','frigo',7,4,'Tranchée : plutôt 3–5 j.',1),
  ('Tofu','frigo',10,3,'Ouvert : immergé dans l''eau, changée chaque jour.',1),
  ('Beurre','frigo',60,30,null,1),
  ('Beurre','congelateur',270,null,null,2),
  ('Lait','frigo',7,4,'Lait frais / pasteurisé.',1),
  ('Lait','placard',90,null,'Lait UHT fermé ; après ouverture, au frigo ~4 j.',2),
  ('Yaourt / laitage','frigo',14,5,'Jusqu''à la DLC ; ouvert, quelques jours.',1),
  ('Fromage à pâte molle','frigo',14,7,'Dans du papier, pas hermétique.',1),
  ('Fromage à pâte dure','frigo',60,30,null,1),
  ('Œufs','placard',28,null,'En France : se conservent hors frigo, à température stable.',1),
  ('Œufs','frigo',35,null,'Prolonge un peu ; éviter d''alterner frigo / température.',2),
  ('Pain','placard',3,null,'Boîte à pain ou torchon.',1),
  ('Pain','congelateur',90,null,'Tranché, pour griller ensuite.',2),
  ('Jus de fruits frais','frigo',5,3,null,1),
  ('Salade / verdure','frigo',5,null,'Bac à légumes, dans un linge humide.',1),
  ('Légumes frais','frigo',7,null,'Bac à légumes.',1),
  ('Légumes frais','placard',30,null,'Pommes de terre, oignons, ail : au sec, à l''abri de la lumière.',2),
  ('Fruits frais','placard',5,null,'À température pour mûrir.',1),
  ('Fruits frais','frigo',7,null,'Une fois mûrs, prolonge.',2),
  ('Sauce / condiment','placard',180,null,'Fermé.',1),
  ('Sauce / condiment','frigo',60,60,'Après ouverture, au frigo.',2)
on conflict (food_category, storage) do nothing;
