-- =============================================================================
-- Mealing — Recettes : photo personnalisée par recette (importer / prendre en photo)
-- =============================================================================
-- Remplace l'icône générique des tuiles par une image fournie par l'utilisateur.
-- Modifiable par TOUT le foyer (table scopée foyer, découplée de la RLS créateur de
-- `recipe`). Bucket Storage PRIVÉ → accès par URL signée. Chemin = `<household_id>/<recipe_id>.jpg`.
-- =============================================================================

create table if not exists public.recipe_image (
  household_id uuid not null references public.household (id) on delete cascade,
  recipe_id    uuid not null references public.recipe (id) on delete cascade,
  path         text not null,
  updated_at   timestamptz not null default now(),
  primary key (household_id, recipe_id)
);

alter table public.recipe_image enable row level security;
drop policy if exists recipe_image_all on public.recipe_image;
create policy recipe_image_all on public.recipe_image
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Bucket privé pour les photos de recettes.
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', false)
on conflict (id) do nothing;

-- Accès aux objets : membre du foyer dont l'id est le 1er segment du chemin.
drop policy if exists recipe_images_read on storage.objects;
create policy recipe_images_read on storage.objects
  for select using (
    bucket_id = 'recipe-images'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists recipe_images_insert on storage.objects;
create policy recipe_images_insert on storage.objects
  for insert with check (
    bucket_id = 'recipe-images'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists recipe_images_update on storage.objects;
create policy recipe_images_update on storage.objects
  for update using (
    bucket_id = 'recipe-images'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists recipe_images_delete on storage.objects;
create policy recipe_images_delete on storage.objects
  for delete using (
    bucket_id = 'recipe-images'
    and public.is_household_member((storage.foldername(name))[1]::uuid)
  );
