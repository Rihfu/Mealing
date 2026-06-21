'use server';

import { getAuthContext } from '@/lib/auth';
import { getExpiryDigest, buildExpiryDigestPayload } from '@/lib/core';
import { savePushSubscription, removePushSubscription, sendPushToProfile } from '@/lib/core/push';

/** Forme sérialisable d'un abonnement push envoyée par le client (extraite de PushSubscription). */
export interface PushSubInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Enregistre l'abonnement push de l'appareil courant pour le profil connecté. */
export async function subscribePushAction(sub: PushSubInput, label?: string): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };
  await savePushSubscription(supabase, userId, sub, label ?? null);
  return { ok: true };
}

/** Supprime l'abonnement de l'appareil courant (désactivation depuis ce navigateur). */
export async function unsubscribePushAction(endpoint: string): Promise<void> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return;
  await removePushSubscription(supabase, userId, endpoint);
}

/**
 * Envoie une notif de TEST (et de vérification de bout en bout) au profil connecté.
 * Contenu = le vrai digest de péremption s'il y a quelque chose à signaler, sinon un
 * message neutre. Renvoie le bilan d'envoi (et si le push est configuré côté serveur).
 */
export async function sendTestPushAction(): Promise<{ sent: number; configured: boolean }> {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId) return { sent: 0, configured: false };

  let payload = {
    title: 'Mealing — notifications activées',
    body: 'Tu recevras un rappel quand des aliments approchent de leur péremption.',
    url: '/stock',
    tag: 'mealing-test',
  };
  if (profile?.household_id) {
    const digest = await getExpiryDigest(supabase, profile.household_id as string);
    const real = buildExpiryDigestPayload(digest);
    if (real) payload = real;
  }

  const res = await sendPushToProfile(supabase, userId, payload);
  return { sent: res.sent, configured: res.configured };
}
