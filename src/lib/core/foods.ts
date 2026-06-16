import type { FoodDetail } from '@/lib/providers/nutrition';
import type { DB } from './types';
import { unwrap } from './types';

/**
 * Importe (ou met à jour) un aliment issu d'un fournisseur nutritionnel dans la
 * table `food`, avec ses valeurs nutritionnelles. Les chiffres proviennent
 * TOUJOURS du fournisseur, jamais d'une génération (principe n°3).
 *
 * Idempotent : ré-importer le même (source, external_id) met à jour les valeurs.
 * @returns l'id du food.
 */
export async function importFood(db: DB, detail: FoodDetail): Promise<string> {
  const existing = await db
    .from('food')
    .select('id')
    .eq('source', detail.source)
    .eq('external_id', detail.externalId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  let foodId: string;
  if (existing.data) {
    foodId = existing.data.id;
  } else {
    const inserted = unwrap(
      await db
        .from('food')
        .insert({
          name: detail.name,
          source: detail.source,
          external_id: detail.externalId,
          barcode: detail.barcode ?? null,
          default_unit: detail.baseUnit,
          base_amount: detail.baseAmount,
        })
        .select('id')
        .single(),
    ) as { id: string };
    foodId = inserted.id;
  }

  if (detail.nutrients.length === 0) return foodId;

  // Résoudre les codes de nutriments vers leurs ids de référentiel.
  const codes = detail.nutrients.map((n) => n.code);
  const types = (unwrap(
    await db.from('nutrient_type').select('id, code').in('code', codes),
  ) ?? []) as Array<{ id: string; code: string }>;
  const codeToId = new Map(types.map((t) => [t.code, t.id]));

  const rows = detail.nutrients
    .filter((n) => codeToId.has(n.code))
    .map((n) => ({
      food_id: foodId,
      nutrient_type_id: codeToId.get(n.code) as string,
      amount: n.amount,
    }));

  if (rows.length > 0) {
    const { error } = await db
      .from('nutrient_value')
      .upsert(rows, { onConflict: 'food_id,nutrient_type_id' });
    if (error) throw new Error(error.message);
  }

  return foodId;
}
