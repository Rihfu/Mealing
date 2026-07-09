'use server';

import { getAuthContext } from '@/lib/auth';
import {
  deleteChatMessage,
  editChatMessage,
  getChatUnreadCount,
  listChatMessages,
  markChatRead,
  sendChatMessage,
  type ChatMessage,
} from '@/lib/core';

/**
 * Actions serveur du chat de foyer. Mutations via core/ (convention projet) ;
 * le TEMPS RÉEL (nouveaux messages) passe par Supabase Realtime côté client,
 * ces actions couvrent l'amorçage, la pagination et les écritures.
 */

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  return { supabase, userId, householdId: profile.household_id as string };
}

export async function listChatAction(
  before?: string,
): Promise<
  { ok: true; messages: ChatMessage[]; hasMore: boolean } | { ok: false; error: string }
> {
  try {
    const { supabase, householdId } = await requireHousehold();
    const res = await listChatMessages(supabase, householdId, { before });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Lecture impossible.' };
  }
}

export async function sendChatAction(
  body: string,
): Promise<{ ok: true; message: ChatMessage } | { ok: false; error: string }> {
  try {
    const { supabase, householdId } = await requireHousehold();
    const message = await sendChatMessage(supabase, householdId, body);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Envoi impossible.' };
  }
}

export async function editChatAction(
  id: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase } = await requireHousehold();
    await editChatMessage(supabase, id, body);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Modification impossible.' };
  }
}

export async function deleteChatAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase } = await requireHousehold();
    await deleteChatMessage(supabase, id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Suppression impossible.' };
  }
}

/** Fil lu — best-effort (un échec n'affiche pas d'erreur, le badge se recalera). */
export async function markChatReadAction(): Promise<void> {
  try {
    const { supabase, householdId } = await requireHousehold();
    await markChatRead(supabase, householdId);
  } catch {
    // silencieux
  }
}

/** Infos du badge « non lus » de la nav (+ contexte Realtime du client). */
export async function chatBadgeInfoAction(): Promise<{
  householdId: string;
  meId: string;
  unread: number;
} | null> {
  try {
    const { supabase, userId, householdId } = await requireHousehold();
    const unread = await getChatUnreadCount(supabase, householdId, userId);
    return { householdId, meId: userId, unread };
  } catch {
    return null;
  }
}
