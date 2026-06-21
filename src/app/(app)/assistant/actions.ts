'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { runAgent, executeAgentPlan, type AgentResult, type ProposedAction } from '@/lib/ai/agent';
import { generateConversationBrief } from '@/lib/ai/conversation-brief';
import {
  listConversations,
  createConversation,
  deleteConversation,
  getConversationMessages,
  countConversationMessages,
  ensureConversationTitle,
  touchConversation,
  getOrCreateActiveConversation,
  ASSISTANT_MESSAGE_LIMIT,
  type ConversationSummary,
  type ConversationMessage,
} from '@/lib/core';

async function authCtx() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) return null;
  return { supabase, userId, householdId: profile.household_id as string };
}

/**
 * Étape 1 : l'agent LIT et PROPOSE (réponse ou plan). N'écrit aucune donnée métier.
 * Persiste l'échange dans la conversation `conversationId` (ou la conversation active si
 * non fourni). Renvoie le `conversationId` réellement utilisé : le client en a besoin quand
 * une conversation est créée à la volée (1er message d'un foyer sans conversation).
 */
export async function askAgentAction(
  message: string,
  conversationId?: string,
): Promise<{ result: AgentResult; conversationId: string }> {
  const c = await authCtx();
  if (!c) return { result: { type: 'reply', message: 'Foyer introuvable.' }, conversationId: conversationId ?? '' };
  const trimmed = message.trim();
  const { supabase, userId, householdId } = c;
  const convId = conversationId || (await getOrCreateActiveConversation(supabase, userId));
  if (!trimmed) return { result: { type: 'reply', message: '…' }, conversationId: convId };

  // Garde-fou : un throw inattendu (erreur réseau IA transitoire, etc.) ne doit pas
  // remonter en « Une erreur est survenue » côté client + perdre l'échange.
  let result: AgentResult;
  try {
    result = await runAgent(supabase, { householdId, profileId: userId, conversationId: convId, message: trimmed });
  } catch (e) {
    console.error('[askAgentAction] runAgent a échoué :', e);
    result = { type: 'reply', message: 'Une erreur interne est survenue, réessaie dans un instant.' };
  }

  const assistantText =
    result.type === 'reply'
      ? result.message
      : `💡 ${result.message}\n${result.actions.map((a) => `• ${a.summary}`).join('\n')} (à confirmer)`;

  await supabase.from('conversation_ia').insert([
    { profile_id: userId, conversation_id: convId, role: 'user', content: trimmed },
    { profile_id: userId, conversation_id: convId, role: 'assistant', content: assistantText },
  ]);
  await ensureConversationTitle(supabase, convId, trimmed);
  await touchConversation(supabase, convId);
  return { result, conversationId: convId };
}

/**
 * Étape 2 : exécution du plan APRÈS confirmation explicite. Seul point d'écriture, via
 * les fonctions core/ et sous le RLS de l'utilisateur.
 */
export async function executeAgentAction(actions: ProposedAction[], conversationId?: string): Promise<{ messages: string[] }> {
  const c = await authCtx();
  if (!c) return { messages: ['Foyer introuvable.'] };
  const { supabase, userId, householdId } = c;
  const convId = conversationId || (await getOrCreateActiveConversation(supabase, userId));

  const messages = await executeAgentPlan(supabase, { householdId, profileId: userId, actions });

  await supabase
    .from('conversation_ia')
    .insert({ profile_id: userId, conversation_id: convId, role: 'assistant', content: `✅ ${messages.join(' ')}` });
  await touchConversation(supabase, convId);

  // Les données partagées ont changé : rafraîchir les vues concernées.
  for (const path of ['/planning', '/stock', '/courses', '/assistant']) {
    revalidatePath(path);
  }
  return { messages };
}

/* --------------------------- Conversations (#3 historique) --------------------------- */

export async function listConversationsAction(): Promise<ConversationSummary[]> {
  const c = await authCtx();
  if (!c) return [];
  return listConversations(c.supabase, c.userId);
}

/** Nouvelle conversation vide → renvoie son id. */
export async function createConversationAction(): Promise<{ id: string } | null> {
  const c = await authCtx();
  if (!c) return null;
  const id = await createConversation(c.supabase, c.userId, null);
  return { id };
}

export async function deleteConversationAction(conversationId: string): Promise<void> {
  const c = await authCtx();
  if (!c) return;
  await deleteConversation(c.supabase, c.userId, conversationId);
  revalidatePath('/assistant');
}

/** Charge les messages + le compteur d'une conversation (pour basculer dessus). */
export async function getConversationAction(
  conversationId: string,
): Promise<{ messages: ConversationMessage[]; messageCount: number; limit: number; limitReached: boolean }> {
  const c = await authCtx();
  if (!c) return { messages: [], messageCount: 0, limit: ASSISTANT_MESSAGE_LIMIT, limitReached: false };
  const messages = await getConversationMessages(c.supabase, conversationId);
  const messageCount = await countConversationMessages(c.supabase, conversationId);
  return { messages, messageCount, limit: ASSISTANT_MESSAGE_LIMIT, limitReached: messageCount >= ASSISTANT_MESSAGE_LIMIT };
}

/**
 * #4 : au seuil, ouvre une NOUVELLE conversation amorcée par un BRIEF de l'ancienne
 * (résumé IA), pour garder le fil sans laisser le contexte (et le coût) gonfler.
 */
export async function startNewConversationWithBriefAction(
  fromConversationId: string,
): Promise<{ id: string; messages: ConversationMessage[] } | null> {
  const c = await authCtx();
  if (!c) return null;
  const { supabase, userId } = c;
  const previous = await getConversationMessages(supabase, fromConversationId);
  const brief = await generateConversationBrief(previous);
  const id = await createConversation(supabase, userId, 'Suite');
  if (brief) {
    await supabase
      .from('conversation_ia')
      .insert({ profile_id: userId, conversation_id: id, role: 'assistant', content: `📋 Reprise — en bref : ${brief}` });
  }
  const messages = await getConversationMessages(supabase, id);
  return { id, messages };
}

/** « Effacer » : supprime la conversation active (repart d'une conversation vierge). */
export async function clearConversationAction(conversationId?: string): Promise<void> {
  const c = await authCtx();
  if (!c) return;
  const convId = conversationId || (await getOrCreateActiveConversation(c.supabase, c.userId));
  await deleteConversation(c.supabase, c.userId, convId);
  revalidatePath('/assistant');
}
