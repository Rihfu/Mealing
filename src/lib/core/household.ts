import type { DB } from './types';
import { unwrap } from './types';

/** Identifiant de l'utilisateur courant (lève si non authentifié). */
async function requireUserId(db: DB): Promise<string> {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error('Utilisateur non authentifié.');
  return data.user.id;
}

/**
 * Crée un Foyer et y rattache le profil du créateur.
 * Le profil est créé automatiquement à l'inscription (trigger handle_new_user).
 */
export async function createHousehold(db: DB, params: { name: string }): Promise<string> {
  const userId = await requireUserId(db);

  const household = unwrap(
    await db
      .from('household')
      .insert({ name: params.name, created_by: userId })
      .select('id')
      .single(),
  ) as { id: string };

  const { error } = await db
    .from('profile')
    .update({ household_id: household.id })
    .eq('id', userId);
  if (error) throw new Error(error.message);

  return household.id;
}

/**
 * Crée une invitation réelle au foyer (email + acceptation), specs 3.6.
 * Le token retourné est destiné au lien d'invitation envoyé par email.
 */
export async function inviteToHousehold(
  db: DB,
  params: { householdId: string; email: string },
): Promise<{ invitationId: string; token: string }> {
  const userId = await requireUserId(db);

  const row = unwrap(
    await db
      .from('household_invitation')
      .insert({
        household_id: params.householdId,
        email: params.email.toLowerCase(),
        invited_by: userId,
      })
      .select('id, token')
      .single(),
  ) as { id: string; token: string };

  return { invitationId: row.id, token: row.token };
}

/**
 * Accepte une invitation : rattache le profil de l'utilisateur courant au foyer
 * et marque l'invitation comme acceptée.
 */
export async function acceptInvitation(db: DB, params: { token: string }): Promise<string> {
  const userId = await requireUserId(db);

  const invitation = unwrap(
    await db
      .from('household_invitation')
      .select('id, household_id, status')
      .eq('token', params.token)
      .single(),
  ) as { id: string; household_id: string; status: string };

  if (invitation.status !== 'pending') {
    throw new Error('Cette invitation n’est plus valide.');
  }

  const updateProfile = await db
    .from('profile')
    .update({ household_id: invitation.household_id })
    .eq('id', userId);
  if (updateProfile.error) throw new Error(updateProfile.error.message);

  const updateInvite = await db
    .from('household_invitation')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq('id', invitation.id);
  if (updateInvite.error) throw new Error(updateInvite.error.message);

  return invitation.household_id;
}
