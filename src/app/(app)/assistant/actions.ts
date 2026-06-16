'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { askAgent, executeAgent, type AgentAction, type AgentDecision } from '@/lib/ai/agent';

/**
 * Étape 1 : l'agent PROPOSE (réponse ou action). N'écrit aucune donnée métier.
 * Persiste l'échange dans conversation_ia pour garder l'historique.
 */
export async function askAgentAction(message: string): Promise<AgentDecision> {
  const trimmed = message.trim();
  if (!trimmed) return { type: 'reply', message: '…' };

  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) {
    return { type: 'reply', message: 'Foyer introuvable.' };
  }
  const householdId = profile.household_id as string;

  const decision = await askAgent(supabase, { householdId, profileId: userId, message: trimmed });

  const assistantText =
    decision.type === 'reply'
      ? decision.message
      : `💡 Proposition : ${decision.proposal.summary} (à confirmer)`;

  await supabase.from('conversation_ia').insert([
    { profile_id: userId, role: 'user', content: trimmed },
    { profile_id: userId, role: 'assistant', content: assistantText },
  ]);

  return decision;
}

/**
 * Étape 2 : exécution APRÈS confirmation explicite de l'utilisateur. Seul point
 * d'écriture, via les fonctions core/ et sous le RLS de l'utilisateur.
 */
export async function executeAgentAction(action: AgentAction): Promise<{ message: string }> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) {
    return { message: 'Foyer introuvable.' };
  }
  const householdId = profile.household_id as string;

  const result = await executeAgent(supabase, { householdId, profileId: userId, action });

  await supabase
    .from('conversation_ia')
    .insert({ profile_id: userId, role: 'assistant', content: `✅ ${result}` });

  // Les données partagées ont changé : rafraîchir les vues concernées.
  for (const path of ['/planning', '/stock', '/courses', '/assistant']) {
    revalidatePath(path);
  }
  return { message: result };
}

export async function clearConversationAction(): Promise<void> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return;
  await supabase.from('conversation_ia').delete().eq('profile_id', userId);
  revalidatePath('/assistant');
}
