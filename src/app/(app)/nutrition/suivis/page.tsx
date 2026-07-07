import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { getNutritionProfile, getNutritionSettings } from '@/lib/core';
import { MesSuivis } from './mes-suivis';

/**
 * État 5 du handoff — « Mes suivis », la surface de gestion unique.
 * Onglet Suivis (actifs réels + catalogue démo) · onglet Profil (facettes démo +
 * infos corporelles réelles, recalcul à l'enregistrement).
 */
export default async function MesSuivisPage() {
  const { supabase, userId } = await getAuthContext();
  const profileId = userId as string;

  const [profile, settings, { data: baseTypes }] = await Promise.all([
    getNutritionProfile(supabase, profileId),
    getNutritionSettings(supabase, profileId),
    supabase.from('nutrient_type').select('code, name, unit, category').eq('is_base', true),
  ]);

  // Non activé → on renvoie vers l'onboarding.
  if (!profile?.onboardedAt) redirect('/nutrition/activer');

  const childMode = profile.persona === 'enfant';

  const trackedSet = new Set(settings.tracked);
  const goalByCode = new Map(settings.goals.map((g) => [g.code, g]));
  const actives = (baseTypes ?? [])
    .filter((t) => trackedSet.has(t.code))
    .filter((t) => !(childMode && t.code === 'energy_kcal'))
    .map((t) => {
      const g = goalByCode.get(t.code);
      return { code: t.code, name: t.name, unit: t.unit, min: g?.min ?? null, max: g?.max ?? null };
    });

  return (
    <MesSuivis
      persona={profile.persona ?? 'equilibre'}
      body={{
        birthYear: profile.birthYear,
        sex: profile.sex,
        weightKg: profile.weightKg,
        heightCm: profile.heightCm,
        activityLevel: profile.activityLevel,
      }}
      actives={actives}
    />
  );
}
