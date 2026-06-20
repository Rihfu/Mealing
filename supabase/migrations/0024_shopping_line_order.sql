-- 0024_shopping_line_order
-- Ordre MANUEL des lignes de la liste de courses au sein d'un rayon (drag-to-reorder,
-- parité avec le Stock). Les lignes sont DYNAMIQUES (générées) → on ne peut pas stocker
-- un sort_index sur une ligne ; on mémorise la position par CLÉ CANONIQUE de ligne
-- (`cf:<foodId>` / `cl:<libellé normalisé>`), scopée foyer. Position 0..n PAR RAYON
-- (jamais comparée d'un rayon à l'autre : le groupement par rayon précède le tri).
-- Additive + RLS foyer.
create table if not exists household_shopping_order (
  household_id uuid not null references household(id) on delete cascade,
  item_key text not null,
  position int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (household_id, item_key)
);

alter table household_shopping_order enable row level security;

create policy household_shopping_order_rw on household_shopping_order
  for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
