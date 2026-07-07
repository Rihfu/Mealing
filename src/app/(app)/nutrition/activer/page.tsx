import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { aggregatePeriodNutrition, getNutritionProfile, listFacets } from '@/lib/core';
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
  const [week, facets] = await Promise.all([
    aggregatePeriodNutrition(supabase, { householdId, profileId, from, to }),
    listFacets(supabase),
  ]);
  const { ingredientsWithData, ingredientsTotal } = week.coverage;

  return (
    <Onboarding
      facets={facets.map((f) => ({ key: f.key, label: f.label, groupe: f.groupe }))}
      // Même convention que le dashboard : % basé sur les INGRÉDIENTS avec données.
      coveragePct={ingredientsTotal > 0 ? Math.round((ingredientsWithData / ingredientsTotal) * 100) : null}
      ingredientsWithData={ingredientsWithData}
      ingredientsTotal={ingredientsTotal}
    />
  );
}
