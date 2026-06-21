-- =============================================================================
-- Mealing — Conversations multiples pour l'assistant IA
-- =============================================================================
-- #3 : historique multi-conversations (liste / nouvelle / basculer / supprimer),
--      façon assistants conversationnels du marché.
-- #4 : base du suivi de limite (jauge en nombre de messages) — la limite et le brief
--      de reprise sont gérés côté application ; ici on rattache simplement chaque
--      message à une conversation, et on range les conversations par profil.
-- Grants : hérités via `alter default privileges` (cf. 0004). RLS : privé par profil.
-- =============================================================================

create table public.ia_conversation (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profile (id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ia_conversation_profile_idx on public.ia_conversation (profile_id, updated_at desc);

alter table public.ia_conversation enable row level security;
create policy ia_conversation_all on public.ia_conversation
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Rattachement des messages existants/futurs à une conversation.
alter table public.conversation_ia
  add column conversation_id uuid references public.ia_conversation (id) on delete cascade;
create index conversation_ia_conversation_idx on public.conversation_ia (conversation_id, created_at);

-- Backfill : une conversation « Conversation » par profil ayant déjà des messages,
-- pour ne pas perdre l'historique au déploiement.
do $$
declare p record;
  conv_id uuid;
begin
  for p in select distinct profile_id from public.conversation_ia where conversation_id is null loop
    insert into public.ia_conversation (profile_id, title)
      values (p.profile_id, 'Conversation') returning id into conv_id;
    update public.conversation_ia set conversation_id = conv_id
      where profile_id = p.profile_id and conversation_id is null;
  end loop;
end $$;
