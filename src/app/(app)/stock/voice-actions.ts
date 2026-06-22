'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { getAIProvider } from '@/lib/providers/ai';
import { parseStockDictation, type DictatedItem } from '@/lib/ai/parse-stock-dictation';
import {
  findCatalogFoodIdByLabel,
  getOrCreateCatalogFood,
  upsertStockItem,
  setStockLocation,
  recordStockEvent,
  type StockTrackingMode,
} from '@/lib/core';

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  return { supabase, householdId: profile.household_id as string };
}

/**
 * Recensement vocal : transcrit l'audio (gpt-4o-transcribe via l'abstraction IA) puis
 * découpe le texte en articles structurés (nature FR + qté + unité + lieu). Ne touche PAS
 * au stock — l'utilisateur valide d'abord (écran de revue). Garde-fou auth (clé serveur).
 */
export async function transcribeStockAction(
  formData: FormData,
): Promise<{ transcript: string; items: DictatedItem[] }> {
  await requireHousehold();
  const file = formData.get('audio');
  if (!(file instanceof Blob) || file.size === 0) return { transcript: '', items: [] };
  const ai = getAIProvider();
  if (!ai.transcribe) return { transcript: '', items: [] };
  const { text } = await ai.transcribe(file, { language: 'fr' });
  const items = await parseStockDictation(text);
  return { transcript: text, items };
}

export interface BulkStockItem {
  label: string;
  quantity: number | null;
  unit: string | null;
  location: string | null;
}

/**
 * Ajoute en LOT des articles au stock (après validation de la dictée). Chaque article est
 * rattaché au catalogue (lien existant sinon création d'une fiche `cat:`) → fiche produit +
 * conservation disponibles. Journalise une entrée (`stock_event` kind='in'). La nutrition
 * n'est jamais touchée (garde-fou n°3). Conservation laissée en lazy (hors chemin chaud).
 */
export async function addStockBulkAction(items: BulkStockItem[]): Promise<{ added: number }> {
  const { supabase, householdId } = await requireHousehold();
  let added = 0;
  for (const it of items) {
    const label = it.label.trim();
    if (!label) continue;
    const foodId =
      (await findCatalogFoodIdByLabel(supabase, label)) ??
      (await getOrCreateCatalogFood(supabase, { label, name: label, category: null })) ??
      undefined;
    const trackingMode: StockTrackingMode = it.quantity != null ? 'quantity' : 'presence';
    const stockId = await upsertStockItem(supabase, {
      householdId,
      foodId,
      label,
      trackingMode,
      quantity: it.quantity ?? undefined,
      unit: it.unit ?? undefined,
      present: true,
    });
    if (it.location) await setStockLocation(supabase, stockId, it.location);
    await recordStockEvent(supabase, {
      householdId,
      stockId,
      foodId: foodId ?? null,
      label,
      kind: 'in',
      quantity: it.quantity ?? null,
      unit: it.unit ?? null,
      source: 'manual',
    });
    added++;
  }
  if (added > 0) revalidatePath('/stock');
  return { added };
}
