import { getAIProvider } from '@/lib/providers/ai';
import type { ConversationMessage } from '@/lib/core';

/**
 * Résume une conversation en un BRIEF concis, pour amorcer une NOUVELLE conversation
 * sans perdre le fil (#4 : limite par messages non bloquante → reprise avec contexte).
 * Best-effort : en cas d'échec IA, renvoie un repli neutre (la reprise ne casse jamais).
 */
export async function generateConversationBrief(messages: ConversationMessage[]): Promise<string> {
  const usable = messages.filter((m) => m.content.trim().length > 0);
  if (usable.length === 0) return '';
  const transcript = usable
    .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content}`)
    .join('\n')
    .slice(0, 8000);
  try {
    const res = await getAIProvider().chat(
      [
        {
          role: 'system',
          content:
            "Tu résumes une conversation entre un utilisateur et l'assistant d'une application de cuisine, courses et stock, afin qu'une NOUVELLE conversation garde le fil. Rédige un brief CONCIS en français (3 à 5 phrases maximum) : ce qui a été discuté ou décidé, et tout point encore en cours à reprendre. Pas de formule d'introduction, pas de liste à puces — juste le brief.",
        },
        { role: 'user', content: `Conversation à résumer :\n\n${transcript}` },
      ],
      { maxTokens: 400 },
    );
    return res.content.trim();
  } catch {
    return 'Reprise de la conversation précédente (résumé indisponible).';
  }
}
