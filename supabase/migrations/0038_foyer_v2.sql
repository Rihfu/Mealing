-- 0038_foyer_v2
-- Foyer V2 (docs/foyer-strategie.md, décisions 2026-07-09) :
--   1) chat de foyer (household_message + marqueur de lecture pour le badge « non lus »),
--   2) préférences de notification PAR MEMBRE (le réglage foyer devient la valeur par défaut).
-- Additif, RLS foyer/self. Realtime : household_message publié (fil en direct).

-- 1) Chat de foyer -----------------------------------------------------------

create table if not exists public.household_message (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.household (id) on delete cascade,
  -- on delete set null : les messages d'un compte supprimé restent lisibles (« membre parti »).
  author_profile_id  uuid references public.profile (id) on delete set null,
  body               text not null check (length(body) between 1 and 4000),
  -- Champs réservés extensibles (principe n°8) : type de message + méta (réactions,
  -- lien vers un repas/produit…) livrables plus tard sans nouvelle colonne.
  kind               text not null default 'text',
  meta               jsonb,
  created_at         timestamptz not null default now(),
  edited_at          timestamptz,
  deleted_at         timestamptz
);

comment on table public.household_message is
  'Fil de discussion du foyer (V1 : texte seul, suppression douce par l''auteur).';

create index if not exists household_message_household_created_idx
  on public.household_message (household_id, created_at desc);

alter table public.household_message enable row level security;

drop policy if exists household_message_select on public.household_message;
create policy household_message_select on public.household_message
  for select using (public.is_household_member(household_id));

drop policy if exists household_message_insert on public.household_message;
create policy household_message_insert on public.household_message
  for insert with check (
    public.is_household_member(household_id) and author_profile_id = auth.uid()
  );

-- Édition / suppression DOUCE (deleted_at) : l'auteur uniquement. Pas de delete dur.
drop policy if exists household_message_update on public.household_message;
create policy household_message_update on public.household_message
  for update using (author_profile_id = auth.uid())
  with check (author_profile_id = auth.uid());

-- Realtime : événements postgres_changes pour le fil en direct (RLS respectée côté client).
alter table public.household_message replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'household_message'
     ) then
    alter publication supabase_realtime add table public.household_message;
  end if;
end;
$$;

-- 2) Marqueur de lecture (badge « non lus ») ---------------------------------

create table if not exists public.household_message_read (
  household_id uuid not null references public.household (id) on delete cascade,
  profile_id   uuid not null references public.profile (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);

alter table public.household_message_read enable row level security;

drop policy if exists household_message_read_self on public.household_message_read;
create policy household_message_read_self on public.household_message_read
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.is_household_member(household_id));

-- 3) Préférences de notification PAR MEMBRE ----------------------------------
-- expiry_threshold_days NULL = hériter du réglage foyer (notification_pref).
-- notify_courses / notify_reminders : réservés (principe n°8) — pas encore consommés.

create table if not exists public.profile_notification_pref (
  profile_id            uuid primary key references public.profile (id) on delete cascade,
  expiry_threshold_days integer check (expiry_threshold_days between 1 and 60),
  notify_expiry         boolean not null default true,
  notify_courses        boolean not null default true,
  notify_reminders      boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.profile_notification_pref is
  'Préférences de notification PERSONNELLES (RLS self). Le réglage foyer reste la valeur par défaut.';

alter table public.profile_notification_pref enable row level security;

drop policy if exists profile_notification_pref_self on public.profile_notification_pref;
create policy profile_notification_pref_self on public.profile_notification_pref
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
