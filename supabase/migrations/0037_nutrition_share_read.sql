-- 0037_nutrition_share_read
-- Rend réel le partage nutrition côté LECTEUR (décision n°4, docs/foyer-section-design.md).
-- Le helper can_view_profile_nutrition() couvrait déjà profile_goal + real_consumption
-- (Phase 2) ; on complète ce qui manque au résumé de semaine :
--   - nutriments suivis (profile_nutrient_tracking)
--   - habitudes suivies (profile_habit_tracking)
--   - drapeaux du profil nutrition — SANS ouvrir la table nutrition_profile :
--     elle contient poids/taille/année de naissance, trop sensibles pour un partage
--     « nutrition ». Seuls is_child + onboarded sont exposés, via une fonction DEFINER.

create policy profile_nutrient_tracking_shared_select on public.profile_nutrient_tracking
  for select using (public.can_view_profile_nutrition(profile_id));

create policy profile_habit_shared_select on public.profile_habit_tracking
  for select using (public.can_view_profile_nutrition(profile_id));

-- Drapeaux minimum du profil nutrition d'un membre qui m'a partagé sa nutrition.
create or replace function public.shared_nutrition_flags(target uuid)
returns table (is_child boolean, onboarded boolean)
language sql stable security definer set search_path = public
as $$
  select np.is_child, (np.onboarded_at is not null) as onboarded
  from public.nutrition_profile np
  where np.profile_id = target
    and public.can_view_profile_nutrition(target);
$$;
