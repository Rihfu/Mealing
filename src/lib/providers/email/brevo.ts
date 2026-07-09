import 'server-only';
import { serverEnv } from '@/lib/env.server';
import type { EmailProvider, SendEmailResult, TransactionalEmail } from './types';

/**
 * Fournisseur email Brevo (API transactionnelle HTTP — pas le SMTP Auth de Supabase).
 * Doc : POST https://api.brevo.com/v3/smtp/email (clé dans l'en-tête `api-key`).
 * Best-effort : ne JETTE jamais — l'appelant lit `sent` et garde son repli.
 */
export const brevoProvider: EmailProvider = {
  name: 'brevo',

  async sendTransactional(email: TransactionalEmail): Promise<SendEmailResult> {
    const apiKey = serverEnv.BREVO_API_KEY;
    if (!apiKey) return { sent: false, reason: 'not-configured' };

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: serverEnv.EMAIL_FROM, name: serverEnv.EMAIL_FROM_NAME },
          to: [{ email: email.to }],
          subject: email.subject,
          htmlContent: email.html,
          ...(email.text ? { textContent: email.text } : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error(`[email:brevo] envoi refusé (${res.status})`, detail.slice(0, 300));
        return { sent: false, reason: 'provider-error', detail: `HTTP ${res.status}` };
      }
      return { sent: true };
    } catch (e) {
      console.error('[email:brevo] envoi impossible', e);
      return { sent: false, reason: 'provider-error', detail: e instanceof Error ? e.message : 'fetch failed' };
    }
  },
};
