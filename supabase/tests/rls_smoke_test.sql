-- =============================================================================
-- Mealing — Test fumée RLS
-- =============================================================================
-- Vérifie les invariants de sécurité de la migration 0002 :
--   1. Isolation Foyer : un membre du foyer B ne voit PAS le stock du foyer A.
--   2. Confidentialité nutritionnelle : la consommation de A est privée pour B,
--      jusqu'à ce que A la partage explicitement (nutrition_share).
--
-- COMMENT L'EXÉCUTER
--   À lancer dans le SQL Editor Supabase (rôle postgres/service, qui peut écrire
--   dans auth.users pour fabriquer deux comptes de test). Le script crée ses
--   données, exécute les assertions, puis NETTOIE tout (rollback implicite via
--   suppression des users de test en fin de script).
--
--   Si une assertion échoue, le script lève une exception explicite : le RLS
--   ne protège pas ce qu'il devrait. Aucune sortie d'erreur = tout est vert.
-- =============================================================================

do $$
declare
  orig_role text := current_user;  -- pour restaurer le rôle au nettoyage
  uid_a uuid := '00000000-0000-0000-0000-0000000000aa';
  uid_b uuid := '00000000-0000-0000-0000-0000000000bb';
  hh_a  uuid;
  hh_b  uuid;
  visible_count int;
begin
  -- --- Préparation (rôle courant = postgres, contourne le RLS) ---------------
  -- Deux comptes de test. Le trigger on_auth_user_created crée les profils.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (uid_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls_test_a@example.com', '', now(), now(), '{}', '{}'),
    (uid_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls_test_b@example.com', '', now(), now(), '{}', '{}')
  on conflict (id) do nothing;

  insert into public.household (id, name, created_by)
    values (gen_random_uuid(), 'Foyer A', uid_a) returning id into hh_a;
  insert into public.household (id, name, created_by)
    values (gen_random_uuid(), 'Foyer B', uid_b) returning id into hh_b;

  update public.profile set household_id = hh_a where id = uid_a;
  update public.profile set household_id = hh_b where id = uid_b;

  -- Stock dans le Foyer A, consommation réelle pour A.
  insert into public.stock (household_id, label, tracking_mode, present)
    values (hh_a, 'Beurre (test)', 'presence', true);
  insert into public.real_consumption (profile_id, status, actual_free_text)
    values (uid_a, 'different', 'Repas test A');

  -- --- Assertion 1 : B ne voit pas le stock de A ----------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_b, 'role', 'authenticated',
                      'email', 'rls_test_b@example.com')::text, true);

  select count(*) into visible_count
    from public.stock where household_id = hh_a;
  if visible_count <> 0 then
    raise exception 'ÉCHEC RLS #1 : le foyer B voit % ligne(s) de stock du foyer A', visible_count;
  end if;

  -- --- Assertion 2 : B ne voit pas la consommation de A (non partagée) -------
  select count(*) into visible_count
    from public.real_consumption where profile_id = uid_a;
  if visible_count <> 0 then
    raise exception 'ÉCHEC RLS #2 : B voit la consommation privée de A sans partage';
  end if;

  -- --- A partage volontairement sa nutrition avec B -------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_a, 'role', 'authenticated',
                      'email', 'rls_test_a@example.com')::text, true);
  insert into public.nutrition_share (owner_profile_id, viewer_profile_id)
    values (uid_a, uid_b) on conflict do nothing;

  -- --- Assertion 3 : après partage, B voit la consommation de A -------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_b, 'role', 'authenticated',
                      'email', 'rls_test_b@example.com')::text, true);
  select count(*) into visible_count
    from public.real_consumption where profile_id = uid_a;
  if visible_count < 1 then
    raise exception 'ÉCHEC RLS #3 : le partage volontaire n''expose pas la consommation de A à B';
  end if;

  -- --- Nettoyage (rôle d'origine) -------------------------------------------
  -- household.created_by est ON DELETE SET NULL : on supprime donc explicitement
  -- les foyers de test AVANT les comptes (sinon ils resteraient orphelins).
  perform set_config('role', orig_role, true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.household where id in (hh_a, hh_b);
  delete from auth.users where id in (uid_a, uid_b);

  raise notice 'OK — RLS : isolation foyer et confidentialité nutritionnelle validées.';
end;
$$;
