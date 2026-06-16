-- =============================================================================
-- Mealing — Durcissement sécurité (Phase 0)
-- =============================================================================
-- Suite aux advisors Supabase :
--   1. set_updated_at n'avait pas de search_path figé -> on le verrouille.
--   2. Les fonctions trigger ne doivent pas être appelables via l'API REST.
--   3. Les helpers RLS ne doivent pas être exposés au rôle `anon`. Ils RESTENT
--      exécutables par `authenticated` : les politiques RLS les appellent et
--      l'évaluation se fait avec les privilèges du rôle appelant (pattern
--      Supabase standard). Ces helpers ne lisent que des données relatives à
--      auth.uid() — ils ne divulguent rien d'autrui.
-- =============================================================================

-- 1. search_path figé sur le trigger updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Fonctions trigger : non destinées à l'API REST.
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.handle_new_user() from public;

-- 3. Helpers RLS : retirer l'accès du PUBLIC (donc d'anon), le rendre à authenticated.
revoke execute on function public.current_household_id() from public;
revoke execute on function public.is_household_member(uuid) from public;
revoke execute on function public.can_view_profile_nutrition(uuid) from public;

grant execute on function public.current_household_id() to authenticated, service_role;
grant execute on function public.is_household_member(uuid) to authenticated, service_role;
grant execute on function public.can_view_profile_nutrition(uuid) to authenticated, service_role;
