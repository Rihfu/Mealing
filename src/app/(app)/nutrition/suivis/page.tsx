import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import {
  getNutritionProfile,
  getNutritionSettings,
  getProfileFacets,
  getProfileHabits,
  listFacets,
  listHabitTypes,
  recommendTracking,
} from '@/lib/core';
import { MesSuivis } from './mes-suivis';

/**
 * État 5 du handoff — « Mes suivis », la surface de gestion unique (branchée, N1.5).
 * Onglet Suivis : nutriments + habitudes actifs (réels) + catalogue d'habitudes réel.
 * Onglet Profil : facettes réelles re-modifiables (recalcul).
 */
export default async function MesSuivisPage() {
  const { supabase, userId } = await getAuthContext();
  const profileId = userId as string;

  const [profile, settings, { data: allNutrientTypes }, facets, selectedFacets, habitTypes, activeHabits] = await Promise.all([
    getNutritionProfile(supabase, profileId),
    getNutritionSettings(supabase, profileId),
    // TOUS les types : les suivis étendus (longue traîne) doivent apparaître, et la
    // recherche du catalogue doit trouver les nutriments cachés (is_base = false).
    supabase.from('nutrient_type').select('code, name, unit, category, is_base'),
    listFacets(supabase),
    getProfileFacets(supabase, profileId),
    listHabitTypes(supabase),
    getProfileHabits(supabase, profileId),
  ]);

  if (!profile?.onboardedAt) redirect('/nutrition/activer');
  const childMode = profile.isChild;

  // Habitudes recommandées (badge « recommandé pour toi » du catalogue).
  const age = profile.birthYear ? Math.max(1, new Date().getFullYear() - profile.birthYear) : null;
  const recos = await recommendTracking(supabase, {
    facets: selectedFacets,
    age,
    sex: profile.sex,
    isChild: childMode,
    cap: 20,
  });
  const recommendedHabitKeys = recos.filter((r) => r.kind === 'habit').map((r) => r.code);

  const trackedSet = new Set(settings.tracked);
  const goalByCode = new Map(settings.goals.map((g) => [g.code, g]));
  const actives = (allNutrientTypes ?? [])
    .filter((t) => trackedSet.has(t.code))
    .filter((t) => !(childMode && t.code === 'energy_kcal'))
    .map((t) => {
      const g = goalByCode.get(t.code);
      return { code: t.code, name: t.name, unit: t.unit, min: g?.min ?? null, max: g?.max ?? null };
    });

  // Longue traîne : nutriments cherchables (non suivis), base + étendus — kcal exclu enfant.
  const searchableNutrients = (allNutrientTypes ?? [])
    .filter((t) => !trackedSet.has(t.code))
    .filter((t) => !(childMode && t.code === 'energy_kcal'))
    .map((t) => ({ code: t.code, name: t.name, unit: t.unit }));

  const activeHabitKeys = new Set(activeHabits.map((h) => h.habitKey).filter(Boolean));
  const catalogue = habitTypes
    .filter((h) => !activeHabitKeys.has(h.key))
    .filter((h) => (childMode ? h.distinct_mode : !h.distinct_mode)) // variété = enfant seulement
    .map((h) => ({
      key: h.key,
      label: h.label,
      description: h.description ?? '',
      recommended: recommendedHabitKeys.includes(h.key),
    }));

  return (
    <MesSuivis
      isChild={childMode}
      body={{
        birthYear: profile.birthYear,
        sex: profile.sex,
        weightKg: profile.weightKg,
        heightCm: profile.heightCm,
        activityLevel: profile.activityLevel,
      }}
      actives={actives}
      habits={activeHabits.map((h) => ({
        id: h.id,
        code: h.habitKey,
        label: h.label,
        direction: h.direction,
        targetCount: h.targetCount,
        period: h.period,
      }))}
      catalogue={catalogue}
      searchableNutrients={searchableNutrients}
      facets={facets.map((f) => ({ key: f.key, label: f.label, groupe: f.groupe }))}
      selectedFacets={selectedFacets}
    />
  );
}
