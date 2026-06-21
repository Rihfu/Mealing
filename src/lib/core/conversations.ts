import type { DB } from './types';

/**
 * Conversations multiples de l'assistant IA (#3 historique) + suivi de limite (#4).
 *
 * Limite EN NOMBRE DE MESSAGES (choix utilisateur : jamais de réponse tronquée en plein
 * milieu comme avec une limite en tokens). NON bloquante : au seuil, l'UI propose d'ouvrir
 * une NOUVELLE conversation qui hérite d'un BRIEF de l'ancienne (cf. `ai/conversation-brief`)
 * pour garder le fil tout en bornant le coût (l'agent ne lit que la conversation courante).
 */
export const ASSISTANT_MESSAGE_LIMIT = 30; // messages (utilisateur + assistant) par conversation

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Liste les conversations du profil (récentes d'abord) avec leur nombre de messages. */
export async function listConversations(db: DB, profileId: string): Promise<ConversationSummary[]> {
  const { data: convs } = await db
    .from('ia_conversation')
    .select('id, title, updated_at')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false });
  const list = (convs ?? []) as Array<{ id: string; title: string | null; updated_at: string }>;
  if (list.length === 0) return [];

  const ids = list.map((c) => c.id);
  const { data: msgs } = await db
    .from('conversation_ia')
    .select('conversation_id')
    .in('conversation_id', ids)
    .in('role', ['user', 'assistant']);
  const counts = new Map<string, number>();
  for (const m of (msgs ?? []) as Array<{ conversation_id: string | null }>) {
    if (m.conversation_id) counts.set(m.conversation_id, (counts.get(m.conversation_id) ?? 0) + 1);
  }
  return list.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at, messageCount: counts.get(c.id) ?? 0 }));
}

/** Crée une conversation et renvoie son id. */
export async function createConversation(db: DB, profileId: string, title?: string | null): Promise<string> {
  const { data, error } = await db
    .from('ia_conversation')
    .insert({ profile_id: profileId, title: title ?? null })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Création de conversation impossible');
  return (data as { id: string }).id;
}

/** Conversation active du profil = la plus récente, sinon on en crée une. */
export async function getOrCreateActiveConversation(db: DB, profileId: string): Promise<string> {
  const { data } = await db
    .from('ia_conversation')
    .select('id')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return (data as { id: string }).id;
  return createConversation(db, profileId, null);
}

/** Messages d'une conversation (chronologique) — affichage ET contexte de l'agent. */
export async function getConversationMessages(db: DB, conversationId: string): Promise<ConversationMessage[]> {
  const { data } = await db
    .from('conversation_ia')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(200);
  return ((data ?? []) as Array<{ role: string; content: string }>).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));
}

/** Nombre de messages (utilisateur + assistant) d'une conversation — pour la jauge. */
export async function countConversationMessages(db: DB, conversationId: string): Promise<number> {
  const { count } = await db
    .from('conversation_ia')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant']);
  return count ?? 0;
}

export async function renameConversation(db: DB, profileId: string, conversationId: string, title: string): Promise<void> {
  await db
    .from('ia_conversation')
    .update({ title: title.slice(0, 80) })
    .eq('id', conversationId)
    .eq('profile_id', profileId);
}

/** Supprime une conversation (ses messages partent en cascade via la FK). */
export async function deleteConversation(db: DB, profileId: string, conversationId: string): Promise<void> {
  await db.from('ia_conversation').delete().eq('id', conversationId).eq('profile_id', profileId);
}

/** Remonte une conversation en tête de liste (activité récente). */
export async function touchConversation(db: DB, conversationId: string): Promise<void> {
  await db.from('ia_conversation').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
}

/** Titre auto depuis le 1er message utilisateur (si la conversation n'en a pas encore). */
export async function ensureConversationTitle(db: DB, conversationId: string, firstMessage: string): Promise<void> {
  const { data } = await db.from('ia_conversation').select('title').eq('id', conversationId).maybeSingle();
  const current = (data as { title: string | null } | null)?.title;
  if (current) return; // déjà titrée
  const title = firstMessage.trim().replace(/\s+/g, ' ').slice(0, 60) || 'Conversation';
  await db.from('ia_conversation').update({ title }).eq('id', conversationId);
}
