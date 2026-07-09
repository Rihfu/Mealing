/**
 * Couche d'abstraction EMAIL transactionnel (principe directeur n°5).
 * Toute la logique dépend de cette interface, jamais d'un fournisseur concret :
 * changer de fournisseur (Brevo → autre) = un module.
 *
 * ⚠️ Distinct du SMTP de Supabase Auth (confirmation/reset) : ici, ce sont les
 * emails APPLICATIFS (invitations de foyer…), envoyés depuis le serveur Next.
 */

export interface TransactionalEmail {
  to: string;
  subject: string;
  html: string;
  /** Version texte (repli lecteurs sans HTML). */
  text?: string;
}

export type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: 'not-configured' | 'provider-error'; detail?: string };

export interface EmailProvider {
  readonly name: string;
  sendTransactional(email: TransactionalEmail): Promise<SendEmailResult>;
}
