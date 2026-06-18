'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { recipeMissingIngredients, findCatalogFoodIdByLabel } from '@/lib/core';

/**
 * Ajoute à la liste de courses les ingrédients de la recette NON couverts par le
 * stock. Chaque ligne est liée au catalogue (food_id de l'ingrédient, sinon
 * rapprochement par libellé) → rayon + icône ; les libellés inconnus sont classés
 * par l'auto-catégorisation au rendu de la liste. Insertion en `shopping_manual_item`
 * (cohérent avec le flux génération) → fusion automatique si déjà sur la liste.
 * @returns le nombre d'articles ajoutés.
 */
export async function addRecipeMissingToShoppingAction(recipeId: string): Promise<number> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  const householdId = profile?.household_id as string | undefined;
  if (!householdId) redirect('/onboarding');
  if (!recipeId) return 0;

  const missing = await recipeMissingIngredients(supabase, householdId, recipeId);
  const rows = await Promise.all(
    missing
      .filter((m) => m.label.trim())
      .map(async (m) => ({
        household_id: householdId,
        label: m.label.trim(),
        food_id: m.foodId ?? (await findCatalogFoodIdByLabel(supabase, m.label)),
        quantity: m.quantity,
        unit: m.unit || null,
      })),
  );

  if (rows.length > 0) await supabase.from('shopping_manual_item').insert(rows);
  revalidatePath('/courses');
  return rows.length;
}
