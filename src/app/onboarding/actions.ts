'use server';

import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { createHousehold } from '@/lib/core';

export interface OnboardingState {
  error?: string;
}

export async function createHouseholdAction(
  _prevState: OnboardingState | undefined,
  formData: FormData,
): Promise<OnboardingState> {
  const householdName = String(formData.get('household_name') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim();

  if (!householdName) {
    return { error: 'Le nom du foyer est requis.' };
  }

  const { supabase, userId } = await getAuthContext();
  if (!userId) redirect('/login');

  if (displayName) {
    await supabase.from('profile').update({ display_name: displayName }).eq('id', userId);
  }

  await createHousehold(supabase, { name: householdName });
  redirect('/planning');
}
