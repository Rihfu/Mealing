'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { upsertStockItem, decrementStock, type StockTrackingMode } from '@/lib/core';

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  return { supabase, householdId: profile.household_id as string };
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v != null && v !== '' && !Number.isNaN(n) ? n : undefined;
};

export async function addStockAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const trackingMode = (String(formData.get('tracking_mode')) || 'presence') as StockTrackingMode;
  const foodId = String(formData.get('food_id') ?? '');
  const label = String(formData.get('label') ?? '').trim();

  await upsertStockItem(supabase, {
    householdId,
    foodId: foodId || undefined,
    label: label || undefined,
    trackingMode,
    quantity: trackingMode === 'quantity' ? num(formData.get('quantity')) : undefined,
    unit: String(formData.get('unit') ?? '') || undefined,
    present: true,
    conservationRuleId: String(formData.get('conservation_rule_id') ?? '') || undefined,
  });
  revalidatePath('/stock');
}

/** Assigne (ou retire) une catégorie de conservation à un article de stock. */
export async function setConservationAction(formData: FormData): Promise<void> {
  const { supabase } = await requireHousehold();
  const ruleId = String(formData.get('conservation_rule_id') ?? '');
  await supabase
    .from('stock')
    .update({ conservation_rule_id: ruleId || null })
    .eq('id', String(formData.get('stock_id')));
  revalidatePath('/stock');
}

export async function decrementStockAction(formData: FormData): Promise<void> {
  const { supabase } = await requireHousehold();
  await decrementStock(supabase, {
    stockId: String(formData.get('stock_id')),
    amount: num(formData.get('amount')) ?? 0,
  });
  revalidatePath('/stock');
}

export async function deleteStockAction(formData: FormData): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('stock').delete().eq('id', String(formData.get('stock_id')));
  revalidatePath('/stock');
}

export async function toggleStockPresenceAction(formData: FormData): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase
    .from('stock')
    .update({ present: formData.get('present') === 'true' })
    .eq('id', String(formData.get('stock_id')));
  revalidatePath('/stock');
}
