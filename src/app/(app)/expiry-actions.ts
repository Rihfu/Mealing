'use server';

import { getAuthContext } from '@/lib/auth';
import { getExpiryDigest, setNotificationPref, type ExpiryDigest } from '@/lib/core';

/**
 * Digest de péremption du foyer (cloche d'en-tête, lu en cache-first côté client).
 * Référence STABLE → passée telle quelle à useCachedResource. Null si non connecté.
 */
export async function getExpiryDigestAction(): Promise<ExpiryDigest | null> {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId || !profile?.household_id) return null;
  return getExpiryDigest(supabase, profile.household_id as string);
}

/** Règle le seuil « M'alerter X jours avant » (par foyer). */
export async function setExpiryThresholdAction(days: number): Promise<void> {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId || !profile?.household_id) return;
  await setNotificationPref(supabase, profile.household_id as string, { expiryThresholdDays: days });
}
