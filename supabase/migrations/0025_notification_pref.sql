-- =============================================================================
-- Mealing — Notifications : préférences de rappel de péremption (par foyer)
-- =============================================================================
-- Socle des rappels de péremption (Phase A in-app + Phase B Web Push).
--   expiry_threshold_days : fenêtre « bientôt » (utilisée in-app ET dans le digest push).
--   digest_hour / timezone / push_enabled / last_digest_sent_on : Phase B (Web Push).
-- Une ligne par foyer. Structure extensible (principe n°8). Additif, RLS foyer.
-- =============================================================================

create table if not exists public.notification_pref (
  household_id          uuid primary key references public.household (id) on delete cascade,
  expiry_threshold_days integer     not null default 3,
  digest_hour           integer     not null default 8,
  timezone              text        not null default 'Europe/Paris',
  push_enabled          boolean     not null default true,
  last_digest_sent_on   date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.notification_pref enable row level security;
drop policy if exists notification_pref_all on public.notification_pref;
create policy notification_pref_all on public.notification_pref
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
