import 'server-only';
import { serverEnv } from '@/lib/env.server';
import { brevoProvider } from './brevo';
import type { EmailProvider, SendEmailResult } from './types';

export type { EmailProvider, SendEmailResult, TransactionalEmail } from './types';
export { buildInvitationEmail } from './templates';

/** Repli quand aucune clé n'est configurée : no-op explicite (jamais d'erreur). */
const noopProvider: EmailProvider = {
  name: 'noop',
  async sendTransactional(): Promise<SendEmailResult> {
    return { sent: false, reason: 'not-configured' };
  },
};

/** Fournisseur email actif (Brevo si configuré, sinon no-op). */
export function getEmailProvider(): EmailProvider {
  return serverEnv.BREVO_API_KEY ? brevoProvider : noopProvider;
}

/**
 * Origine publique du site pour construire des liens absolus (emails).
 * Priorité : origine explicite (headers de la requête) → SITE_URL/NEXT_PUBLIC_SITE_URL
 * → URL de prod Vercel → null (l'appelant garde son repli sans email).
 */
export function resolveSiteOrigin(explicit?: string | null): string | null {
  if (explicit) return explicit.replace(/\/$/, '');
  if (serverEnv.SITE_URL) {
    const u = serverEnv.SITE_URL.replace(/\/$/, '');
    return u.startsWith('http') ? u : `https://${u}`;
  }
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return null;
}
