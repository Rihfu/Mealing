import type { TransactionalEmail } from './types';

/**
 * Templates d'emails APPLICATIFS (DA papier/sauge, alignés sur les templates
 * Supabase Auth de docs/email-templates-supabase.md — §4 « Invite user »).
 * HTML tables + styles inline : compatibilité clients mail.
 */

const FONT_SANS = `-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_SERIF = `Georgia,'Times New Roman',serif`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Email d'invitation à rejoindre un foyer (lien token, expire 7 j). */
export function buildInvitationEmail(params: {
  acceptUrl: string;
  householdName: string;
  inviterName?: string;
  siteOrigin: string;
}): Omit<TransactionalEmail, 'to'> {
  const { acceptUrl } = params;
  const household = esc(params.householdName);
  const inviter = params.inviterName?.trim() ? esc(params.inviterName.trim()) : null;
  const who = inviter ? `<strong>${inviter}</strong> vous invite` : 'Quelqu&rsquo;un vous invite';

  const subject = inviter
    ? `${params.inviterName!.trim()} vous invite à rejoindre son foyer sur Mealings`
    : 'Vous êtes invité·e à rejoindre un foyer sur Mealings';

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fbf7ef;margin:0;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#fffdfa;border:1px solid #e7e0d2;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:28px 40px 4px 40px;text-align:center;">
        <img src="${params.siteOrigin}/icon-192.png" width="64" height="64" alt="" style="display:block;margin:0 auto 6px auto;border:0;outline:none;text-decoration:none;" />
        <div style="font-family:${FONT_SERIF};font-size:24px;font-weight:700;color:#2f8049;letter-spacing:-0.3px;">Mealings</div>
      </td></tr>
      <tr><td style="padding:16px 40px 8px 40px;">
        <h1 style="margin:0 0 12px 0;font-family:${FONT_SERIF};font-size:22px;font-weight:700;color:#34322c;text-align:center;">Vous êtes invité·e&nbsp;! ✉️</h1>
        <p style="margin:0 0 24px 0;font-family:${FONT_SANS};font-size:15px;line-height:1.6;color:#34322c;text-align:center;">${who} à rejoindre le foyer «&nbsp;<strong>${household}</strong>&nbsp;» sur Mealings — l&rsquo;appli qui planifie les repas, les courses et le stock en famille.</p>
      </td></tr>
      <tr><td style="padding:0 40px 24px 40px;text-align:center;">
        <a href="${acceptUrl}" style="display:inline-block;background-color:#2f8049;color:#ffffff;font-family:${FONT_SANS};font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;">Rejoindre le foyer</a>
      </td></tr>
      <tr><td style="padding:0 40px 20px 40px;">
        <p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:#6f6b61;text-align:center;">Ce lien est valable 7 jours. Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur&nbsp;:<br><a href="${acceptUrl}" style="color:#2f8049;word-break:break-all;">${acceptUrl}</a></p>
      </td></tr>
      <tr><td style="padding:16px 40px 28px 40px;border-top:1px solid #e7e0d2;">
        <p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:#6f6b61;text-align:center;">Vous ne vous attendiez pas à cette invitation&nbsp;? Vous pouvez ignorer cet email.</p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0 0;font-family:${FONT_SANS};font-size:11px;color:#6f6b61;text-align:center;">Mealings · l&rsquo;appli qui planifie vos repas</p>
  </td></tr>
</table>`.trim();

  const text = [
    inviter
      ? `${params.inviterName!.trim()} vous invite à rejoindre le foyer « ${params.householdName} » sur Mealings.`
      : `Vous êtes invité·e à rejoindre le foyer « ${params.householdName} » sur Mealings.`,
    '',
    `Rejoindre le foyer (lien valable 7 jours) : ${acceptUrl}`,
    '',
    'Vous ne vous attendiez pas à cette invitation ? Vous pouvez ignorer cet email.',
  ].join('\n');

  return { subject, html, text };
}
