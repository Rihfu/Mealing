import 'server-only';
import webpush from 'web-push';
import { serverEnv } from '@/lib/env.server';
import type { DB } from './types';
import { unwrap } from './types';

/**
 * Notifications Web Push (Phase B). SERVER-ONLY : web-push est une lib Node (crypto/https)
 * — ne JAMAIS l'importer côté client, et ne pas la réexporter via core/index (qui est aussi
 * importé par des composants client). Les clés VAPID sont optionnelles : sans elles, l'envoi
 * est simplement no-op (l'app fonctionne, le push est juste indisponible).
 */
let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = serverEnv;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:notifications@mealing.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(serverEnv.VAPID_PUBLIC_KEY && serverEnv.VAPID_PRIVATE_KEY);
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Enregistre (ou rafraîchit) un abonnement push d'un appareil/navigateur du profil. */
export async function savePushSubscription(
  db: DB,
  profileId: string,
  sub: PushSubscriptionInput,
  label?: string | null,
): Promise<void> {
  await db.from('push_subscription').upsert(
    {
      profile_id: profileId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      label: label ?? null,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
}

export async function removePushSubscription(db: DB, profileId: string, endpoint: string): Promise<void> {
  await db.from('push_subscription').delete().eq('profile_id', profileId).eq('endpoint', endpoint);
}

/**
 * Envoie une notif à tous les abonnements ACTIFS d'un profil. Purge les abonnements
 * expirés (404/410 = endpoint révoqué). Renvoie le bilan d'envoi.
 */
export async function sendPushToProfile(
  db: DB,
  profileId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number; configured: boolean }> {
  if (!ensureVapid()) return { sent: 0, removed: 0, configured: false };
  const subs = (unwrap(
    await db.from('push_subscription').select('endpoint, p256dh, auth').eq('profile_id', profileId).eq('enabled', true),
  ) ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>;

  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db.from('push_subscription').delete().eq('endpoint', s.endpoint);
          removed += 1;
        } else {
          console.error('[push] envoi échoué:', code, (e as Error).message);
        }
      }
    }),
  );
  return { sent, removed, configured: true };
}
