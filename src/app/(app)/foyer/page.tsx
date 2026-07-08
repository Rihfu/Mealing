import { headers } from 'next/headers';
import { getAuthContext } from '@/lib/auth';
import { getHouseholdOverview, getNotificationPref } from '@/lib/core';
import { FoyerView } from './foyer-view';

export default async function FoyerPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;
  const me = userId as string;

  const [overview, pref] = await Promise.all([
    getHouseholdOverview(supabase, householdId),
    getNotificationPref(supabase, householdId),
  ]);

  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';

  return (
    <FoyerView
      overview={overview}
      expiryThresholdDays={pref.expiryThresholdDays}
      baseUrl={`${proto}://${host}`}
      meId={me}
    />
  );
}
