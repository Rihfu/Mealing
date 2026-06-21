import type { DB } from './types';
import { getStockWithExpiry } from './conservation';

/**
 * Préférences de notification d'un foyer + dérivation du « digest de péremption ».
 * Fonctions backend réutilisables (principe n°4) : l'UI (cloche d'en-tête) ET le futur
 * planificateur Web Push (Phase B) consomment ces mêmes fonctions. Lecture seule côté
 * digest (dérivé de getStockWithExpiry — aucune IA, aucune donnée inventée, principe n°3).
 */

export interface NotificationPref {
  /** Fenêtre « bientôt » : on alerte les articles à ≤ N jours de la péremption. */
  expiryThresholdDays: number;
  /** Heure locale d'envoi du digest push (Phase B). */
  digestHour: number;
  timezone: string;
  pushEnabled: boolean;
}

const DEFAULT_PREF: NotificationPref = {
  expiryThresholdDays: 3,
  digestHour: 8,
  timezone: 'Europe/Paris',
  pushEnabled: true,
};

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/** Préférences du foyer (valeurs par défaut si aucune ligne n'existe encore). */
export async function getNotificationPref(db: DB, householdId: string): Promise<NotificationPref> {
  // ⚠️ maybeSingle() → data null quand aucune préférence n'a encore été enregistrée
  // (cas NORMAL). Ne JAMAIS passer par unwrap() ici (réservé à .single()).
  const { data } = await db
    .from('notification_pref')
    .select('expiry_threshold_days, digest_hour, timezone, push_enabled')
    .eq('household_id', householdId)
    .maybeSingle();
  if (!data) return DEFAULT_PREF;
  return {
    expiryThresholdDays: data.expiry_threshold_days ?? DEFAULT_PREF.expiryThresholdDays,
    digestHour: data.digest_hour ?? DEFAULT_PREF.digestHour,
    timezone: data.timezone ?? DEFAULT_PREF.timezone,
    pushEnabled: data.push_enabled ?? DEFAULT_PREF.pushEnabled,
  };
}

/** Met à jour (upsert) les préférences du foyer. Les champs absents gardent leur valeur. */
export async function setNotificationPref(
  db: DB,
  householdId: string,
  patch: Partial<NotificationPref>,
): Promise<void> {
  const row: Record<string, unknown> = { household_id: householdId, updated_at: new Date().toISOString() };
  if (patch.expiryThresholdDays !== undefined) row.expiry_threshold_days = clampInt(patch.expiryThresholdDays, 1, 60);
  if (patch.digestHour !== undefined) row.digest_hour = clampInt(patch.digestHour, 0, 23);
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.pushEnabled !== undefined) row.push_enabled = patch.pushEnabled;
  const { error } = await db.from('notification_pref').upsert(row, { onConflict: 'household_id' });
  if (error) throw new Error(error.message);
}

export type ExpirySeverity = 'expired' | 'urgent' | 'soon';

export interface ExpiryDigestItem {
  /** id de la ligne de stock. */
  id: string;
  /** aliment de catalogue lié (→ fiche produit), si présent. */
  foodId: string | null;
  name: string;
  /** jours avant péremption (négatif = déjà périmé). */
  daysRemaining: number;
  severity: ExpirySeverity;
}

export interface ExpiryDigest {
  /** seuil « bientôt » appliqué (jours). */
  threshold: number;
  total: number;
  /** déjà périmés (daysRemaining < 0). */
  expired: ExpiryDigestItem[];
  /** aujourd'hui / demain (0–1 j). */
  urgent: ExpiryDigestItem[];
  /** bientôt (2 … seuil). */
  soon: ExpiryDigestItem[];
}

/**
 * Digest de péremption d'un foyer : articles à ≤ seuil jours (ou déjà périmés), classés
 * par sévérité, triés par péremption croissante. Dérivé de getStockWithExpiry (cache de
 * conservation, AUCUN appel IA). Sert la cloche in-app (Phase A) et le push (Phase B).
 */
export async function getExpiryDigest(db: DB, householdId: string): Promise<ExpiryDigest> {
  const pref = await getNotificationPref(db, householdId);
  const threshold = pref.expiryThresholdDays;
  const items = await getStockWithExpiry(db, householdId); // déjà trié par daysRemaining asc

  const expired: ExpiryDigestItem[] = [];
  const urgent: ExpiryDigestItem[] = [];
  const soon: ExpiryDigestItem[] = [];

  for (const e of items) {
    if (e.daysRemaining == null) continue;
    const d = e.daysRemaining;
    let severity: ExpirySeverity;
    if (d < 0) severity = 'expired';
    else if (d <= 1) severity = 'urgent';
    else if (d <= threshold) severity = 'soon';
    else continue; // au-delà du seuil → pas dans le digest
    const item: ExpiryDigestItem = { id: e.id, foodId: e.foodId, name: e.name, daysRemaining: d, severity };
    (severity === 'expired' ? expired : severity === 'urgent' ? urgent : soon).push(item);
  }

  return { threshold, total: expired.length + urgent.length + soon.length, expired, urgent, soon };
}

/** Contenu d'une notif push (forme PLAINE, sans dépendance server-only → réutilisable côté client/serveur/Edge). */
export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Construit le contenu de la notif « résumé de péremption » à partir d'un digest.
 * Renvoie null si rien ne périme (pas de notif inutile). Utilisé par l'envoi de test
 * (Next) et, transposé, par le planificateur quotidien (Edge Function + pg_cron).
 */
export function buildExpiryDigestPayload(digest: ExpiryDigest): NotificationPayload | null {
  if (digest.total === 0) return null;
  const parts: string[] = [];
  if (digest.expired.length) parts.push(`${digest.expired.length} périmé${digest.expired.length > 1 ? 's' : ''}`);
  if (digest.urgent.length) parts.push(`${digest.urgent.length} à consommer vite`);
  if (digest.soon.length) parts.push(`${digest.soon.length} bientôt`);
  const names = [...digest.expired, ...digest.urgent, ...digest.soon].slice(0, 3).map((i) => i.name);
  const title = digest.expired.length > 0 ? 'Des aliments ont périmé' : 'Pense à ton stock';
  const body = `${parts.join(' · ')} — ${names.join(', ')}${digest.total > 3 ? '…' : ''}`;
  return { title, body, url: '/stock', tag: 'mealing-expiry' };
}
