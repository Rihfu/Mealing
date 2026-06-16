'use server';

import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { acceptInvitation } from '@/lib/core';

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const { supabase, userId } = await getAuthContext();
  if (!userId) redirect('/login');

  let ok = false;
  try {
    await acceptInvitation(supabase, { token });
    ok = true;
  } catch {
    ok = false;
  }

  redirect(ok ? '/planning' : `/invitations/accept?token=${token}&error=1`);
}
