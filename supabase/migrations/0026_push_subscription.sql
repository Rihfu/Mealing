-- =============================================================================
-- Mealing — Notifications : abonnements Web Push (Phase B)
-- =============================================================================
-- Un abonnement = un appareil/navigateur d'un profil (endpoint unique + clés).
-- Le planificateur (Supabase pg_cron + Edge Function, service-role) lit ces lignes
-- pour envoyer le digest quotidien de péremption. Additif, RLS : un profil ne gère
-- que SES propres abonnements (auth.uid()).
-- =============================================================================

create table if not exists public.push_subscription (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profile (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  label        text,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscription_profile_idx on public.push_subscription (profile_id);

alter table public.push_subscription enable row level security;
drop policy if exists push_subscription_all on public.push_subscription;
create policy push_subscription_all on public.push_subscription
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
