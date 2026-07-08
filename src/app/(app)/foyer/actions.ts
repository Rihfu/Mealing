'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getAuthContext } from '@/lib/auth';
import {
  inviteToHousehold,
  renameHousehold,
  transferHouseholdAdmin,
  leaveHousehold,
  removeHouseholdMember,
  setHouseholdSettings,
  setMyDisplayName,
  setNotificationPref,
  getSharedNutritionWeek,
  type SharedNutritionWeek,
} from '@/lib/core';

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  return { supabase, userId, householdId: profile.household_id as string };
}

type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (e: unknown, fallback: string): ActionResult => ({
  ok: false,
  error: e instanceof Error ? e.message : fallback,
});

export async function renameHouseholdAction(name: string): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireHousehold();
    await renameHousehold(supabase, householdId, name);
  } catch (e) {
    return fail(e, 'Renommage impossible.');
  }
  revalidatePath('/foyer');
  return { ok: true };
}

export async function setDisplayNameAction(name: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireHousehold();
    await setMyDisplayName(supabase, name);
  } catch (e) {
    return fail(e, 'Prénom non enregistré.');
  }
  revalidatePath('/foyer');
  return { ok: true };
}

export async function inviteMemberAction(email: string): Promise<ActionResult> {
  const parsed = z.string().email().safeParse(email.trim());
  if (!parsed.success) return { ok: false, error: 'Adresse email invalide.' };
  try {
    const { supabase, householdId } = await requireHousehold();
    await inviteToHousehold(supabase, { householdId, email: parsed.data });
  } catch (e) {
    return fail(e, 'Invitation impossible.');
  }
  revalidatePath('/foyer');
  return { ok: true };
}

export async function cancelInvitationAction(id: string): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireHousehold();
    const { error } = await supabase
      .from('household_invitation')
      .delete()
      .eq('id', id)
      .eq('household_id', householdId);
    if (error) throw new Error(error.message);
  } catch (e) {
    return fail(e, 'Annulation impossible.');
  }
  revalidatePath('/foyer');
  return { ok: true };
}

export async function transferAdminAction(memberId: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireHousehold();
    await transferHouseholdAdmin(supabase, memberId);
  } catch (e) {
    return fail(e, 'Transfert impossible.');
  }
  revalidatePath('/foyer');
  return { ok: true };
}

export async function removeMemberAction(memberId: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireHousehold();
    await removeHouseholdMember(supabase, memberId);
  } catch (e) {
    return fail(e, 'Retrait impossible.');
  }
  revalidatePath('/foyer');
  return { ok: true };
}

/**
 * Quitte le foyer puis redirige vers l'onboarding (le shell (app) exige un foyer).
 * En cas d'échec, renvoie l'erreur SANS rediriger.
 */
export async function leaveHouseholdAction(leaveRecipes: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await requireHousehold();
    await leaveHousehold(supabase, leaveRecipes);
  } catch (e) {
    return fail(e, 'Départ impossible.');
  }
  redirect('/onboarding');
}

export async function setHouseholdSettingsAction(settings: {
  shoppingHorizonDays?: number;
  defaultServings?: number | null;
}): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireHousehold();
    await setHouseholdSettings(supabase, householdId, settings);
  } catch (e) {
    return fail(e, 'Réglage non enregistré.');
  }
  revalidatePath('/foyer');
  revalidatePath('/courses');
  revalidatePath('/planning');
  return { ok: true };
}

export async function setExpiryThresholdAction(days: number): Promise<ActionResult> {
  try {
    const { supabase, householdId } = await requireHousehold();
    await setNotificationPref(supabase, householdId, { expiryThresholdDays: days });
  } catch (e) {
    return fail(e, 'Réglage non enregistré.');
  }
  revalidatePath('/foyer');
  return { ok: true };
}

/** Active/désactive le partage de MA nutrition vers un autre membre (privé par défaut). */
export async function toggleNutritionShareAction(viewerId: string, share: boolean): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireHousehold();
    if (share) {
      const { error } = await supabase
        .from('nutrition_share')
        .upsert(
          { owner_profile_id: userId, viewer_profile_id: viewerId },
          { onConflict: 'owner_profile_id,viewer_profile_id' },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('nutrition_share')
        .delete()
        .eq('owner_profile_id', userId)
        .eq('viewer_profile_id', viewerId);
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    return fail(e, 'Partage non modifié.');
  }
  revalidatePath('/foyer');
  return { ok: true };
}

/** Résumé lecture seule de la semaine nutrition d'un membre qui m'a partagé la sienne. */
export async function sharedNutritionAction(
  ownerId: string,
): Promise<{ ok: true; week: SharedNutritionWeek } | { ok: false; error: string }> {
  try {
    const { supabase, householdId } = await requireHousehold();
    const week = await getSharedNutritionWeek(supabase, { householdId, ownerProfileId: ownerId });
    return { ok: true, week };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Lecture impossible.' };
  }
}
