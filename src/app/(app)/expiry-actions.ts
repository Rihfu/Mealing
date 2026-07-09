'use server';

import { getAuthContext } from '@/lib/auth';
import { getExpiryDigest, setProfileNotificationPref, type ExpiryDigest } from '@/lib/core';

/**
 * Digest de péremption du foyer (cloche d'en-tête, lu en cache-first côté client).
 * Seuil PERSONNEL du membre (repli : seuil du foyer). Référence STABLE → passée
 * telle quelle à useCachedResource. Null si non connecté.
 */
export async function getExpiryDigestAction(): Promise<ExpiryDigest | null> {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId || !profile?.household_id) return null;
  return getExpiryDigest(supabase, profile.household_id as string, userId);
}

/**
 * Règle le seuil « M'alerter X jours avant » — PERSONNEL depuis Foyer V2 (chacun ses
 * alertes) ; le réglage foyer (page Foyer) reste la valeur par défaut des membres.
 */
export async function setExpiryThresholdAction(days: number): Promise<void> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return;
  await setProfileNotificationPref(supabase, userId, { expiryThresholdDays: days });
}
