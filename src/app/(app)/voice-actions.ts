'use server';

import { getAuthContext } from '@/lib/auth';
import { getAIProvider } from '@/lib/providers/ai';
import { parseStockDictation, type DictatedItem } from '@/lib/ai/parse-stock-dictation';

/**
 * Transcription d'une dictée (audio → texte via gpt-4o-transcribe) + découpe en articles
 * (nature FR + qté + unité + lieu). PARTAGÉE par les saisies vocales Stock ET Courses
 * (le composant `VoiceCapture` reçoit cette action en prop). Ne touche à AUCUNE donnée
 * métier — l'utilisateur valide d'abord (écran de revue). Garde-fou auth (clé serveur).
 */
export async function transcribeDictationAction(
  formData: FormData,
): Promise<{ transcript: string; items: DictatedItem[] }> {
  const { userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  const file = formData.get('audio');
  if (!(file instanceof Blob) || file.size === 0) return { transcript: '', items: [] };
  const ai = getAIProvider();
  if (!ai.transcribe) return { transcript: '', items: [] };
  const { text } = await ai.transcribe(file, { language: 'fr' });
  const items = await parseStockDictation(text);
  return { transcript: text, items };
}

/**
 * Découpe un TEXTE déjà transcrit en articles (nature FR + qté + unité + lieu), sans
 * audio. Permet de transcrire une dictée LONGUE par SEGMENTS (chacun via
 * `transcribeTextAction`, petit + rapide → sous la limite de taille des Server Actions
 * et le timeout serverless), de concaténer les textes, puis de parser UNE seule fois.
 */
export async function parseDictationAction(text: string): Promise<{ items: DictatedItem[] }> {
  const { userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  const items = await parseStockDictation(text);
  return { items };
}

/**
 * Transcription SEULE (audio → texte), sans découpe : pour la saisie vocale de
 * l'assistant (on veut le message brut, pas une liste d'articles) ET pour chaque SEGMENT
 * d'une dictée longue (Stock/Courses). Garde-fou auth.
 */
export async function transcribeTextAction(formData: FormData): Promise<{ text: string }> {
  const { userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  const file = formData.get('audio');
  if (!(file instanceof Blob) || file.size === 0) return { text: '' };
  const ai = getAIProvider();
  if (!ai.transcribe) return { text: '' };
  const { text } = await ai.transcribe(file, { language: 'fr' });
  return { text };
}
