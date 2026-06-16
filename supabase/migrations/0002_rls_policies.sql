-- =============================================================================
-- Mealing — Row Level Security (Phase 0)
-- =============================================================================
-- Principes appliqués :
--   * Données partagées (Foyer) : visibles/modifiables par les membres du foyer.
--   * Données nutritionnelles (consommation, objectifs) : PRIVÉES par défaut,
--     partage volontaire via nutrition_share (specs 3.6).
--   * Helpers en SECURITY DEFINER pour éviter la récursion RLS sur profile.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER : contournent le RLS, search_path verrouillé)
-- -----------------------------------------------------------------------------
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.profile where id = auth.uid();
$$;

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile
    where id = auth.uid() and household_id = hid
  );
$$;

create or replace function public.can_view_profile_nutrition(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target = auth.uid()
      or exists (
        select 1 from public.nutrition_share s
        where s.owner_profile_id = target
          and s.viewer_profile_id = auth.uid()
      );
$$;

-- -----------------------------------------------------------------------------
-- Création automatique du Profil à l'inscription
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Activation du RLS sur toutes les tables applicatives
-- -----------------------------------------------------------------------------
alter table public.household                 enable row level security;
alter table public.profile                   enable row level security;
alter table public.household_invitation      enable row level security;
alter table public.nutrient_type             enable row level security;
alter table public.food                      enable row level security;
alter table public.nutrient_value            enable row level security;
alter table public.recipe                    enable row level security;
alter table public.recipe_ingredient         enable row level security;
alter table public.recipe_tag                enable row level security;
alter table public.planned_meal              enable row level security;
alter table public.day_off_plan              enable row level security;
alter table public.real_consumption          enable row level security;
alter table public.profile_goal              enable row level security;
alter table public.profile_nutrient_tracking enable row level security;
alter table public.nutrition_share           enable row level security;
alter table public.conservation_rule         enable row level security;
alter table public.stock                     enable row level security;
alter table public.shopping_recurring_item   enable row level security;
alter table public.shopping_manual_item      enable row level security;
alter table public.shopping_item_state       enable row level security;
alter table public.conversation_ia           enable row level security;

-- =============================================================================
-- PROFIL
-- =============================================================================
create policy profile_select on public.profile
  for select using (
    id = auth.uid()
    or (household_id is not null and household_id = public.current_household_id())
  );

create policy profile_insert on public.profile
  for insert with check (id = auth.uid());

create policy profile_update on public.profile
  for update using (id = auth.uid()) with check (id = auth.uid());

-- =============================================================================
-- FOYER
-- =============================================================================
create policy household_select on public.household
  for select using (public.is_household_member(id) or created_by = auth.uid());

create policy household_insert on public.household
  for insert with check (created_by = auth.uid());

create policy household_update on public.household
  for update using (public.is_household_member(id)) with check (public.is_household_member(id));

create policy household_delete on public.household
  for delete using (created_by = auth.uid());

-- =============================================================================
-- INVITATION
-- =============================================================================
create policy invitation_select on public.household_invitation
  for select using (
    public.is_household_member(household_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy invitation_insert on public.household_invitation
  for insert with check (public.is_household_member(household_id) and invited_by = auth.uid());

-- Accepter/refuser : le destinataire (email correspondant) ou un membre du foyer.
create policy invitation_update on public.household_invitation
  for update using (
    public.is_household_member(household_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy invitation_delete on public.household_invitation
  for delete using (public.is_household_member(household_id));

-- =============================================================================
-- RÉFÉRENTIEL NUTRITIONNEL
-- =============================================================================
-- nutrient_type : lecture pour tous les authentifiés ; écriture réservée au
-- service_role (qui contourne le RLS) -> aucune policy d'écriture.
create policy nutrient_type_select on public.nutrient_type
  for select using (auth.role() = 'authenticated');

-- food : lecture pour tous les authentifiés ; création d'aliments "manual" libre ;
-- modification/suppression réservées au créateur.
create policy food_select on public.food
  for select using (auth.role() = 'authenticated');

create policy food_insert on public.food
  for insert with check (auth.uid() is not null);

create policy food_update on public.food
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy food_delete on public.food
  for delete using (created_by = auth.uid());

-- nutrient_value : lecture pour tous ; écriture liée à un food modifiable par l'user.
create policy nutrient_value_select on public.nutrient_value
  for select using (auth.role() = 'authenticated');

create policy nutrient_value_write on public.nutrient_value
  for all using (
    exists (select 1 from public.food f where f.id = food_id and f.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.food f where f.id = food_id and f.created_by = auth.uid())
  );

-- =============================================================================
-- RECETTES (cookbook partagé au sein du foyer du créateur)
-- =============================================================================
create policy recipe_select on public.recipe
  for select using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profile p
      where p.id = recipe.created_by
        and p.household_id is not null
        and p.household_id = public.current_household_id()
    )
  );

create policy recipe_insert on public.recipe
  for insert with check (created_by = auth.uid());

create policy recipe_update on public.recipe
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy recipe_delete on public.recipe
  for delete using (created_by = auth.uid());

-- recipe_ingredient & recipe_tag : suivent la visibilité de la recette parente.
create policy recipe_ingredient_all on public.recipe_ingredient
  for all using (
    exists (select 1 from public.recipe r where r.id = recipe_id and r.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.recipe r where r.id = recipe_id and r.created_by = auth.uid())
  );

create policy recipe_ingredient_select on public.recipe_ingredient
  for select using (
    exists (
      select 1 from public.recipe r
      where r.id = recipe_id
        and (
          r.created_by = auth.uid()
          or exists (
            select 1 from public.profile p
            where p.id = r.created_by and p.household_id = public.current_household_id()
          )
        )
    )
  );

create policy recipe_tag_all on public.recipe_tag
  for all using (
    exists (select 1 from public.recipe r where r.id = recipe_id and r.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.recipe r where r.id = recipe_id and r.created_by = auth.uid())
  );

create policy recipe_tag_select on public.recipe_tag
  for select using (
    exists (
      select 1 from public.recipe r
      where r.id = recipe_id
        and (
          r.created_by = auth.uid()
          or exists (
            select 1 from public.profile p
            where p.id = r.created_by and p.household_id = public.current_household_id()
          )
        )
    )
  );

-- =============================================================================
-- PLANIFICATION (partagé Foyer)
-- =============================================================================
create policy planned_meal_all on public.planned_meal
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy day_off_plan_all on public.day_off_plan
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- =============================================================================
-- CONSOMMATION RÉELLE (privé par défaut, partage volontaire en lecture)
-- =============================================================================
create policy real_consumption_select on public.real_consumption
  for select using (public.can_view_profile_nutrition(profile_id));

create policy real_consumption_modify on public.real_consumption
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- =============================================================================
-- OBJECTIFS & SUIVI NUTRIMENTS
-- =============================================================================
create policy profile_goal_select on public.profile_goal
  for select using (public.can_view_profile_nutrition(profile_id));

create policy profile_goal_modify on public.profile_goal
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy profile_nutrient_tracking_all on public.profile_nutrient_tracking
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- nutrition_share : géré par le propriétaire ; visible par owner et viewer.
create policy nutrition_share_select on public.nutrition_share
  for select using (owner_profile_id = auth.uid() or viewer_profile_id = auth.uid());

create policy nutrition_share_modify on public.nutrition_share
  for all using (owner_profile_id = auth.uid()) with check (owner_profile_id = auth.uid());

-- =============================================================================
-- STOCK & CONSERVATION (partagé Foyer)
-- =============================================================================
create policy stock_all on public.stock
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- conservation_rule : table de référence, lecture pour tous, écriture service_role.
create policy conservation_rule_select on public.conservation_rule
  for select using (auth.role() = 'authenticated');

-- =============================================================================
-- LISTE DE COURSES (partagé Foyer)
-- =============================================================================
create policy shopping_recurring_all on public.shopping_recurring_item
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy shopping_manual_all on public.shopping_manual_item
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy shopping_item_state_all on public.shopping_item_state
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- =============================================================================
-- CONVERSATION IA (privé)
-- =============================================================================
create policy conversation_ia_all on public.conversation_ia
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
