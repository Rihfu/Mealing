import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { aggregatePeriodNutrition, getNutritionProfile } from '@/lib/core';
import { addDays, isoDate, mondayOf } from '@/lib/dates';
import { Onboarding } from './onboarding';

/**
 * États 2/3 du handoff — onboarding « Parle-nous de toi » → « Ton plan de suivi »
 * → cérémonie de fin. La couverture des données (réelle) alimente l'écran de fin.
 */
export default async function ActivateNutritionPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;
  const profileId = userId as string;

  // Déjà activé → on ne rejoue pas l'onboarding.
  const existing = await getNutritionProfile(supabase, profileId);
  if (existing?.onboardedAt) redirect('/nutrition');

  const from = isoDate(mondayOf());
  const to = isoDate(addDays(mondayOf(), 6));
  const week = await aggregatePeriodNutrition(supabase, { householdId, profileId, from, to });
  const { mealsCovered, mealsTotal, ingredientsWithData, ingredientsTotal } = week.coverage;

  return (
    <Onboarding
      coveragePct={mealsTotal > 0 ? Math.round((mealsCovered / mealsTotal) * 100) : null}
      ingredientsWithData={ingredientsWithData}
      ingredientsTotal={ingredientsTotal}
    />
  );
}
