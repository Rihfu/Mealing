'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';

/**
 * Définit les objectifs nutritionnels quotidiens du profil courant (cible = max),
 * par code de nutriment. Une valeur vide supprime l'objectif. Données strictement
 * personnelles (RLS profile_goal).
 */
export async function setGoalsAction(formData: FormData): Promise<void> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return;

  const { data: types } = await supabase
    .from('nutrient_type')
    .select('id, code')
    .eq('is_base', true);

  for (const t of types ?? []) {
    const raw = formData.get(`goal_${t.code}`);
    const value = raw != null && String(raw).trim() !== '' ? Number(raw) : null;

    if (value != null && !Number.isNaN(value) && value > 0) {
      await supabase
        .from('profile_goal')
        .upsert(
          { profile_id: userId, nutrient_type_id: t.id, period: 'daily', target_max: value },
          { onConflict: 'profile_id,nutrient_type_id,period' },
        );
    } else {
      await supabase
        .from('profile_goal')
        .delete()
        .eq('profile_id', userId)
        .eq('nutrient_type_id', t.id)
        .eq('period', 'daily');
    }
  }

  revalidatePath('/nutrition');
}
