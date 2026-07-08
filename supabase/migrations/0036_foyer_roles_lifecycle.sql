-- 0036_foyer_roles_lifecycle
-- Section Foyer (docs/foyer-section-design.md, arbitrages 2026-07-08) :
-- rôles (admin simple + transfert), cycle de vie (quitter / retirer un membre),
-- invitations expirables (7 jours), portions par défaut du foyer.
--
-- Sécurité : renommage et transfert d'admin passent par des fonctions SECURITY DEFINER
-- (les privilèges d'UPDATE direct sur `household` sont réduits aux réglages du quotidien),
-- pour qu'un membre ne puisse ni s'auto-promouvoir ni renommer via l'API.

-- 1) Colonnes ---------------------------------------------------------------

alter table public.household
  add column if not exists admin_profile_id uuid references public.profile(id) on delete set null,
  add column if not exists default_servings integer check (default_servings between 1 and 24);

comment on column public.household.admin_profile_id is
  'Admin du foyer (rôle simple, transférable). Backfill = créateur.';
comment on column public.household.default_servings is
  'Portions par défaut d''un repas de foyer (les enfants sans compte comptent ici).';

alter table public.household_invitation
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

-- 2) Backfill admin = créateur s'il est encore membre, sinon le membre le plus ancien
update public.household h
set admin_profile_id = coalesce(
  (select p.id from public.profile p where p.id = h.created_by and p.household_id = h.id),
  (select p.id from public.profile p where p.household_id = h.id order by p.created_at asc limit 1)
)
where h.admin_profile_id is null;

-- 3) Helper -----------------------------------------------------------------

create or replace function public.is_household_admin(hid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.household h
    where h.id = hid and h.admin_profile_id = auth.uid()
  );
$$;

-- 4) Policies : suppression du foyer = admin (avant : créateur) ; invitations gérées
--    par l'admin (décision n°2). La lecture reste ouverte aux membres.

drop policy if exists household_delete on public.household;
create policy household_delete on public.household
  for delete using (public.is_household_admin(id));

drop policy if exists invitation_insert on public.household_invitation;
create policy invitation_insert on public.household_invitation
  for insert with check (public.is_household_admin(household_id) and invited_by = auth.uid());

drop policy if exists invitation_delete on public.household_invitation;
create policy invitation_delete on public.household_invitation
  for delete using (public.is_household_admin(household_id));

-- 5) Privilèges de colonne : l'UPDATE direct de `household` est réservé aux réglages
--    du quotidien (cadence, portions). name/admin_profile_id passent par les fonctions.

revoke update on table public.household from authenticated;
grant update (shopping_horizon_days, default_servings, updated_at)
  on table public.household to authenticated;

-- 6) Fonctions de cycle de vie ----------------------------------------------

create or replace function public.rename_household(p_household uuid, p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_household_admin(p_household) then
    raise exception 'Seul l''admin du foyer peut le renommer.';
  end if;
  if p_name is null or length(trim(p_name)) < 1 or length(trim(p_name)) > 80 then
    raise exception 'Nom de foyer invalide.';
  end if;
  update public.household set name = trim(p_name), updated_at = now() where id = p_household;
end;
$$;

create or replace function public.transfer_household_admin(p_new_admin uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hh uuid;
begin
  select household_id into v_hh from public.profile where id = auth.uid();
  if v_hh is null or not public.is_household_admin(v_hh) then
    raise exception 'Seul l''admin du foyer peut transférer son rôle.';
  end if;
  if not exists (select 1 from public.profile where id = p_new_admin and household_id = v_hh) then
    raise exception 'Le nouveau responsable doit être membre du foyer.';
  end if;
  update public.household set admin_profile_id = p_new_admin, updated_at = now() where id = v_hh;
end;
$$;

-- Quitter le foyer. p_leave_recipes = true → « laisser mes recettes au foyer »
-- (transfert au repreneur : l'admin s'il reste, sinon le membre le plus ancien) ;
-- false → « les emporter » (RLS actuel : elles disparaissent du foyer avec lui).
-- Dernier membre → le foyer et toutes ses données partagées sont supprimés (cascade).
create or replace function public.leave_household(p_leave_recipes boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hh uuid;
  v_admin uuid;
  v_others integer;
  v_heir uuid;
begin
  if v_uid is null then
    raise exception 'Non authentifié.';
  end if;
  select household_id into v_hh from public.profile where id = v_uid;
  if v_hh is null then
    raise exception 'Aucun foyer à quitter.';
  end if;
  select admin_profile_id into v_admin from public.household where id = v_hh;
  select count(*) into v_others from public.profile where household_id = v_hh and id <> v_uid;

  -- Ses partages nutrition n'ont plus de sens hors du foyer (dans les deux sens).
  delete from public.nutrition_share where owner_profile_id = v_uid or viewer_profile_id = v_uid;

  if v_others = 0 then
    -- Dernier membre : le foyer disparaît avec toutes ses données partagées.
    delete from public.household where id = v_hh;
    return;
  end if;

  select id into v_heir from public.profile
  where household_id = v_hh and id <> v_uid
  order by (id = v_admin) desc, created_at asc
  limit 1;

  if p_leave_recipes then
    update public.recipe set created_by = v_heir where created_by = v_uid;
  end if;

  -- Nettoyage : ses repas individuels futurs + ses jours hors-plan personnels futurs.
  delete from public.planned_meal
  where household_id = v_hh and is_individual and individual_profile_id = v_uid
    and meal_date >= current_date;
  delete from public.day_off_plan
  where household_id = v_hh and scope = 'profile' and profile_id = v_uid
    and off_date >= current_date;

  if v_admin = v_uid then
    update public.household set admin_profile_id = v_heir, updated_at = now() where id = v_hh;
  end if;
  update public.profile set household_id = null, updated_at = now() where id = v_uid;
end;
$$;

-- Retrait d'un membre par l'admin. Décision n°3 : on ne peut pas demander au retiré →
-- ses recettes RESTENT au foyer (transférées à l'admin).
create or replace function public.remove_household_member(p_member uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hh uuid;
begin
  select household_id into v_hh from public.profile where id = v_uid;
  if v_hh is null or not public.is_household_admin(v_hh) then
    raise exception 'Seul l''admin du foyer peut retirer un membre.';
  end if;
  if p_member = v_uid then
    raise exception 'Pour te retirer toi-même, utilise « Quitter le foyer ».';
  end if;
  if not exists (select 1 from public.profile where id = p_member and household_id = v_hh) then
    raise exception 'Ce profil n''est pas membre du foyer.';
  end if;

  update public.recipe set created_by = v_uid where created_by = p_member;

  delete from public.nutrition_share where owner_profile_id = p_member or viewer_profile_id = p_member;
  delete from public.planned_meal
  where household_id = v_hh and is_individual and individual_profile_id = p_member
    and meal_date >= current_date;
  delete from public.day_off_plan
  where household_id = v_hh and scope = 'profile' and profile_id = p_member
    and off_date >= current_date;

  update public.profile set household_id = null, updated_at = now() where id = p_member;
end;
$$;
