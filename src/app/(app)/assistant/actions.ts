'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { askAssistant } from '@/lib/ai/assistant';

export async function sendMessageAction(formData: FormData): Promise<void> {
  const message = String(formData.get('message') ?? '').trim();
  if (!message) return;

  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) return;

  await askAssistant(supabase, {
    householdId: profile.household_id as string,
    profileId: userId,
    message,
  });
  revalidatePath('/assistant');
}

export async function clearConversationAction(): Promise<void> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return;
  await supabase.from('conversation_ia').delete().eq('profile_id', userId);
  revalidatePath('/assistant');
}
