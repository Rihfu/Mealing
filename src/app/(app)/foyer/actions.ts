'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthContext } from '@/lib/auth';
import { inviteToHousehold } from '@/lib/core';

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  return { supabase, userId, householdId: profile.household_id as string };
}

export async function inviteAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const email = z.string().email().safeParse(String(formData.get('email') ?? '').trim());
  if (!email.success) return;
  await inviteToHousehold(supabase, { householdId, email: email.data });
  revalidatePath('/foyer');
}

export async function cancelInvitationAction(formData: FormData): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('household_invitation').delete().eq('id', String(formData.get('id')));
  revalidatePath('/foyer');
}

/** Active/désactive le partage de MA nutrition vers un autre membre (privé par défaut). */
export async function toggleNutritionShareAction(formData: FormData): Promise<void> {
  const { supabase, userId } = await requireHousehold();
  const viewerId = String(formData.get('viewer_id'));
  const share = formData.get('share') === 'true';

  if (share) {
    await supabase
      .from('nutrition_share')
      .upsert(
        { owner_profile_id: userId, viewer_profile_id: viewerId },
        { onConflict: 'owner_profile_id,viewer_profile_id' },
      );
  } else {
    await supabase
      .from('nutrition_share')
      .delete()
      .eq('owner_profile_id', userId)
      .eq('viewer_profile_id', viewerId);
  }
  revalidatePath('/foyer');
}
