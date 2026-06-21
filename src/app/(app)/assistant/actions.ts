'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { runAgent, executeAgentPlan, type AgentResult, type ProposedAction } from '@/lib/ai/agent';

/**
 * Étape 1 : l'agent LIT (via ses outils) et PROPOSE une réponse ou un plan d'actions.
 * N'écrit aucune donnée métier. Persiste l'échange dans conversation_ia.
 */
export async function askAgentAction(message: string): Promise<AgentResult> {
  const trimmed = message.trim();
  if (!trimmed) return { type: 'reply', message: '…' };

  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) {
    return { type: 'reply', message: 'Foyer introuvable.' };
  }
  const householdId = profile.household_id as string;

  // Garde-fou : un throw inattendu (erreur réseau IA transitoire, etc.) ne doit pas
  // remonter en « Une erreur est survenue » côté client + perdre l'échange.
  let result: AgentResult;
  try {
    result = await runAgent(supabase, { householdId, profileId: userId, message: trimmed });
  } catch (e) {
    console.error('[askAgentAction] runAgent a échoué :', e);
    result = { type: 'reply', message: 'Une erreur interne est survenue, réessaie dans un instant.' };
  }

  const assistantText =
    result.type === 'reply'
      ? result.message
      : `💡 ${result.message}\n${result.actions.map((a) => `• ${a.summary}`).join('\n')} (à confirmer)`;

  await supabase.from('conversation_ia').insert([
    { profile_id: userId, role: 'user', content: trimmed },
    { profile_id: userId, role: 'assistant', content: assistantText },
  ]);

  return result;
}

/**
 * Étape 2 : exécution du plan APRÈS confirmation explicite. Seul point d'écriture, via
 * les fonctions core/ et sous le RLS de l'utilisateur.
 */
export async function executeAgentAction(actions: ProposedAction[]): Promise<{ messages: string[] }> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) {
    return { messages: ['Foyer introuvable.'] };
  }
  const householdId = profile.household_id as string;

  const messages = await executeAgentPlan(supabase, { householdId, profileId: userId, actions });

  await supabase
    .from('conversation_ia')
    .insert({ profile_id: userId, role: 'assistant', content: `✅ ${messages.join(' ')}` });

  // Les données partagées ont changé : rafraîchir les vues concernées.
  for (const path of ['/planning', '/stock', '/courses', '/assistant']) {
    revalidatePath(path);
  }
  return { messages };
}

export async function clearConversationAction(): Promise<void> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return;
  await supabase.from('conversation_ia').delete().eq('profile_id', userId);
  revalidatePath('/assistant');
}
