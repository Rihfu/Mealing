'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  setTripFavorite,
  renameTrip,
  deleteTrip,
  updateTripItem,
  deleteTripItem,
  reconductTripItems,
} from '@/lib/core';

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  const householdId = profile?.household_id as string | undefined;
  if (!householdId) redirect('/onboarding');
  return { supabase, householdId };
}

/** Épingle/dépingle un relevé (favori : en tête + exempté de la purge auto). */
export async function toggleTripFavoriteAction(input: { tripId: string; isFavorite: boolean }): Promise<void> {
  const { supabase } = await requireHousehold();
  await setTripFavorite(supabase, input.tripId, input.isFavorite);
  revalidatePath('/courses/historique');
}

/** Renomme un relevé (nom vide → retour à l'affichage par date). */
export async function renameTripAction(input: { tripId: string; name: string }): Promise<void> {
  const { supabase } = await requireHousehold();
  await renameTrip(supabase, input.tripId, input.name);
  revalidatePath('/courses/historique');
}

/** Supprime un relevé (et ses articles, via cascade). */
export async function deleteTripAction(tripId: string): Promise<void> {
  const { supabase } = await requireHousehold();
  if (tripId) await deleteTrip(supabase, tripId);
  revalidatePath('/courses/historique');
}

/** Modifie la quantité/unité d'un article d'un relevé. */
export async function updateTripItemAction(input: {
  itemId: string;
  quantity: number | null;
  unit: string | null;
}): Promise<void> {
  const { supabase } = await requireHousehold();
  if (input.itemId) await updateTripItem(supabase, input.itemId, { quantity: input.quantity, unit: input.unit });
  revalidatePath('/courses/historique');
}

/** Retire un article d'un relevé. */
export async function deleteTripItemAction(itemId: string): Promise<void> {
  const { supabase } = await requireHousehold();
  if (itemId) await deleteTripItem(supabase, itemId);
  revalidatePath('/courses/historique');
}

/**
 * Reconduit les articles sélectionnés vers la liste de courses actuelle.
 * @returns le nombre d'articles ré-ajoutés.
 */
export async function reconductTripAction(itemIds: string[]): Promise<number> {
  const { supabase, householdId } = await requireHousehold();
  const n = await reconductTripItems(supabase, householdId, itemIds);
  revalidatePath('/courses');
  return n;
}
