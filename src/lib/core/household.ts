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
 * et marque l'invitation comme acceptée. Refuse une invitation expirée (7 jours).
 */
export async function acceptInvitation(db: DB, params: { token: string }): Promise<string> {
  const userId = await requireUserId(db);

  const invitation = unwrap(
    await db
      .from('household_invitation')
      .select('id, household_id, status, expires_at')
      .eq('token', params.token)
      .single(),
  ) as { id: string; household_id: string; status: string; expires_at: string };

  if (invitation.status !== 'pending') {
    throw new Error('Cette invitation n’est plus valide.');
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    await db.from('household_invitation').update({ status: 'expired' }).eq('id', invitation.id);
    throw new Error('Cette invitation a expiré — demande un nouveau lien.');
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

/* ------------------- Vue d'ensemble & réglages (section Foyer) ------------------- */

export interface HouseholdMember {
  id: string;
  displayName: string;
  joinedAt: string;
  isAdmin: boolean;
}

export interface HouseholdInvitationRow {
  id: string;
  email: string;
  token: string;
  expiresAt: string;
}

export interface HouseholdOverview {
  id: string;
  name: string;
  adminProfileId: string | null;
  /** L'utilisateur courant est-il l'admin ? */
  isAdmin: boolean;
  defaultServings: number | null;
  shoppingHorizonDays: number;
  members: HouseholdMember[];
  /** Invitations encore valides (les expirées sont basculées `expired` au passage). */
  invitations: HouseholdInvitationRow[];
  /** Membres à qui J'AI partagé ma nutrition. */
  sharesGiven: string[];
  /** Membres qui M'ONT partagé la leur. */
  sharesReceived: string[];
}

/**
 * Charge tout ce qu'affiche la page Foyer, et bascule au passage en `expired`
 * les invitations pendantes dont la date est dépassée (expiration paresseuse).
 */
export async function getHouseholdOverview(db: DB, householdId: string): Promise<HouseholdOverview> {
  const userId = await requireUserId(db);

  // Expiration paresseuse (autorisée aux membres par la policy update).
  await db
    .from('household_invitation')
    .update({ status: 'expired' })
    .eq('household_id', householdId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  const [hhRes, membersRes, invRes, givenRes, receivedRes] = await Promise.all([
    db
      .from('household')
      .select('id, name, admin_profile_id, default_servings, shopping_horizon_days')
      .eq('id', householdId)
      .single(),
    db.from('profile').select('id, display_name, created_at').eq('household_id', householdId).order('created_at', { ascending: true }),
    db
      .from('household_invitation')
      .select('id, email, token, expires_at')
      .eq('household_id', householdId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    db.from('nutrition_share').select('viewer_profile_id').eq('owner_profile_id', userId),
    db.from('nutrition_share').select('owner_profile_id').eq('viewer_profile_id', userId),
  ]);

  const hh = unwrap(hhRes) as {
    id: string;
    name: string;
    admin_profile_id: string | null;
    default_servings: number | null;
    shopping_horizon_days: number;
  };
  const members = ((membersRes.data ?? []) as Array<{ id: string; display_name: string | null; created_at: string }>).map(
    (m) => ({
      id: m.id,
      displayName: m.display_name?.trim() || '(sans nom)',
      joinedAt: m.created_at,
      isAdmin: m.id === hh.admin_profile_id,
    }),
  );

  return {
    id: hh.id,
    name: hh.name,
    adminProfileId: hh.admin_profile_id,
    isAdmin: hh.admin_profile_id === userId,
    defaultServings: hh.default_servings,
    shoppingHorizonDays: hh.shopping_horizon_days,
    members,
    invitations: ((invRes.data ?? []) as Array<{ id: string; email: string; token: string; expires_at: string }>).map(
      (i) => ({ id: i.id, email: i.email, token: i.token, expiresAt: i.expires_at }),
    ),
    sharesGiven: ((givenRes.data ?? []) as Array<{ viewer_profile_id: string }>).map((s) => s.viewer_profile_id),
    sharesReceived: ((receivedRes.data ?? []) as Array<{ owner_profile_id: string }>).map((s) => s.owner_profile_id),
  };
}

/** Renomme le foyer (admin uniquement — contrôle en base, fonction DEFINER). */
export async function renameHousehold(db: DB, householdId: string, name: string): Promise<void> {
  const { error } = await db.rpc('rename_household', { p_household: householdId, p_name: name });
  if (error) throw new Error(error.message);
}

/** Transfère le rôle d'admin à un autre membre (admin uniquement). */
export async function transferHouseholdAdmin(db: DB, newAdminId: string): Promise<void> {
  const { error } = await db.rpc('transfer_household_admin', { p_new_admin: newAdminId });
  if (error) throw new Error(error.message);
}

/**
 * Quitte le foyer. `leaveRecipes` = true → mes recettes sont transférées au foyer
 * (décision n°3) ; false → je les emporte (elles disparaissent du foyer).
 * Dernier membre → le foyer et ses données partagées sont supprimés.
 */
export async function leaveHousehold(db: DB, leaveRecipes: boolean): Promise<void> {
  const { error } = await db.rpc('leave_household', { p_leave_recipes: leaveRecipes });
  if (error) throw new Error(error.message);
}

/** Retire un membre du foyer (admin uniquement). Ses recettes restent au foyer. */
export async function removeHouseholdMember(db: DB, memberId: string): Promise<void> {
  const { error } = await db.rpc('remove_household_member', { p_member: memberId });
  if (error) throw new Error(error.message);
}

/** Réglages du quotidien du foyer (modifiables par tout membre). */
export async function setHouseholdSettings(
  db: DB,
  householdId: string,
  settings: { shoppingHorizonDays?: number; defaultServings?: number | null },
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (settings.shoppingHorizonDays !== undefined) {
    const days = Math.round(settings.shoppingHorizonDays);
    if (days < 1 || days > 30) throw new Error('Cadence invalide (1 à 30 jours).');
    patch.shopping_horizon_days = days;
  }
  if (settings.defaultServings !== undefined) {
    if (settings.defaultServings !== null) {
      const s = Math.round(settings.defaultServings);
      if (s < 1 || s > 24) throw new Error('Portions par défaut invalides (1 à 24).');
      patch.default_servings = s;
    } else {
      patch.default_servings = null;
    }
  }
  const { error } = await db.from('household').update(patch).eq('id', householdId);
  if (error) throw new Error(error.message);
}

/** Met à jour le prénom affiché de l'utilisateur courant. */
export async function setMyDisplayName(db: DB, name: string): Promise<void> {
  const userId = await requireUserId(db);
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 40) throw new Error('Prénom invalide.');
  const { error } = await db
    .from('profile')
    .update({ display_name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
