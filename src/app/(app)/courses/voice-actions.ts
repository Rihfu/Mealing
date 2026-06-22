'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { findCatalogFoodIdByLabel, getOrCreateCatalogFood } from '@/lib/core';
import type { BulkVoiceItem } from '@/components/voice-capture';

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  return { supabase, householdId: profile.household_id as string };
}

/**
 * Ajoute en LOT des articles à la LISTE DE COURSES (après validation de la dictée — cf.
 * VoiceCapture). Comme `addManualAction` mais par lot : chaque article est rattaché au
 * catalogue (lien existant sinon création d'une fiche `cat:`) → rayon/icône/fiche. Le nom
 * dicté est déjà une nature générique FR, donc pas de re-classification IA ici ; le rayon
 * s'auto-attribue au rendu (generateShoppingListAutoSorted). `location` est ignoré (la liste
 * n'a pas de lieu de stockage). Garde-fou n°3 : aucune donnée nutritionnelle produite.
 */
export async function addManualBulkAction(items: BulkVoiceItem[]): Promise<{ added: number }> {
  const { supabase, householdId } = await requireHousehold();
  let added = 0;
  for (const it of items) {
    const label = it.label.trim();
    if (!label) continue;
    const foodId =
      (await findCatalogFoodIdByLabel(supabase, label)) ??
      (await getOrCreateCatalogFood(supabase, { label, name: label, category: null }));
    await supabase.from('shopping_manual_item').insert({
      household_id: householdId,
      label,
      food_id: foodId,
      quantity: it.quantity,
      unit: it.unit,
    });
    added++;
  }
  if (added > 0) revalidatePath('/courses');
  return { added };
}
