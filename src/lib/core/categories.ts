import type { DB } from './types';
import { unwrap } from './types';
import { normalizeLabel } from '@/lib/text';

// Personnalisation des rayons par foyer (chantier perso) :
//   * shopping_category   : rayons custom d'un foyer.
//   * household_food_pref : préférence « libellé/aliment → rayon (+ icône) », qui sert
//     à la fois à DÉPLACER un article vers un rayon et à MÉMORISER le classement d'un
//     ajout libre (re-proposé/reclassé ensuite). Toute la logique passe par core/ (n°4).

export interface HouseholdCategory {
  id: string;
  label: string;
  iconSlug: string | null;
  tint: string | null;
  position: number;
}

export interface FoodPref {
  labelNorm: string;
  displayLabel: string;
  foodId: string | null;
  categoryKey: string | null; // clé intégrée OU id de shopping_category
  iconSlug: string | null;
}

/** Préférences foyer indexées pour la résolution (par libellé normalisé et par aliment). */
export interface FoodPrefIndex {
  byLabel: Map<string, FoodPref>;
  byFood: Map<string, FoodPref>;
  all: FoodPref[];
}

/** Rayons personnalisés d'un foyer, triés (position puis libellé). */
export async function listHouseholdCategories(db: DB, householdId: string): Promise<HouseholdCategory[]> {
  const rows = (unwrap(
    await db
      .from('shopping_category')
      .select('id, label, icon_slug, tint, position')
      .eq('household_id', householdId)
      .order('position', { ascending: true })
      .order('label', { ascending: true }),
  ) ?? []) as Array<{ id: string; label: string; icon_slug: string | null; tint: string | null; position: number }>;
  return rows.map((r) => ({ id: r.id, label: r.label, iconSlug: r.icon_slug, tint: r.tint, position: r.position }));
}

/** Crée un rayon personnalisé. @returns l'id du rayon. */
export async function createHouseholdCategory(
  db: DB,
  householdId: string,
  input: { label: string; iconSlug?: string | null; tint?: string | null; position?: number },
): Promise<string> {
  const inserted = unwrap(
    await db
      .from('shopping_category')
      .insert({
        household_id: householdId,
        label: input.label.trim(),
        icon_slug: input.iconSlug ?? null,
        tint: input.tint ?? null,
        position: input.position ?? 0,
      })
      .select('id')
      .single(),
  ) as { id: string };
  return inserted.id;
}

export async function updateHouseholdCategory(
  db: DB,
  id: string,
  patch: { label?: string; iconSlug?: string | null; tint?: string | null; position?: number },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.iconSlug !== undefined) row.icon_slug = patch.iconSlug;
  if (patch.tint !== undefined) row.tint = patch.tint;
  if (patch.position !== undefined) row.position = patch.position;
  if (Object.keys(row).length === 0) return;
  const { error } = await db.from('shopping_category').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Supprime un rayon custom. Les articles qui le visaient retombent en « Autres » au rendu. */
export async function deleteHouseholdCategory(db: DB, householdId: string, id: string): Promise<void> {
  // On nettoie les préférences qui pointaient vers ce rayon (sinon clé orpheline).
  await db
    .from('household_food_pref')
    .update({ category_key: null })
    .eq('household_id', householdId)
    .eq('category_key', id);
  const { error } = await db.from('shopping_category').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Enregistre/maj la préférence de classement d'un foyer pour un libellé (déplacement
 * d'un article vers un rayon + mémorisation). Upsert par (foyer, libellé normalisé).
 */
export async function setFoodPref(
  db: DB,
  householdId: string,
  input: { label: string; foodId?: string | null; categoryKey?: string | null; iconSlug?: string | null },
): Promise<void> {
  const display = input.label.trim();
  const labelNorm = normalizeLabel(display);
  if (!labelNorm) return;
  const { error } = await db.from('household_food_pref').upsert(
    {
      household_id: householdId,
      label_norm: labelNorm,
      display_label: display,
      food_id: input.foodId ?? null,
      category_key: input.categoryKey ?? null,
      icon_slug: input.iconSlug ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'household_id,label_norm' },
  );
  if (error) throw new Error(error.message);
}

/** Supprime la préférence d'un libellé (retour au classement par défaut). */
export async function clearFoodPref(db: DB, householdId: string, label: string): Promise<void> {
  await db
    .from('household_food_pref')
    .delete()
    .eq('household_id', householdId)
    .eq('label_norm', normalizeLabel(label));
}

/**
 * Ordre d'affichage des rayons CHOISI par le foyer (liste + mode magasin).
 * Clé = clé intégrée ('legumes'…) OU uuid de shopping_category (rayon custom).
 * Renvoyé comme map clé→position ; les rayons absents gardent l'ordre par défaut
 * (résolu côté appelant). Vide tant que l'utilisateur n'a pas réordonné.
 */
export async function loadRayonOrder(db: DB, householdId: string): Promise<Map<string, number>> {
  const rows = (unwrap(
    await db
      .from('household_rayon_order')
      .select('rayon_key, position')
      .eq('household_id', householdId),
  ) ?? []) as Array<{ rayon_key: string; position: number }>;
  return new Map(rows.map((r) => [r.rayon_key, r.position]));
}

/**
 * Enregistre l'ordre COMPLET des rayons (positions 0..n-1 dans l'ordre fourni).
 * Remplace l'ordre précédent du foyer (delete + insert) — simple et idempotent.
 */
export async function saveRayonOrder(db: DB, householdId: string, orderedKeys: string[]): Promise<void> {
  await db.from('household_rayon_order').delete().eq('household_id', householdId);
  if (orderedKeys.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await db.from('household_rayon_order').insert(
    orderedKeys.map((rayon_key, position) => ({ household_id: householdId, rayon_key, position, updated_at: now })),
  );
  if (error) throw new Error(error.message);
}

/** Charge et indexe les préférences d'un foyer (pour le classement de la liste). */
export async function loadFoodPrefs(db: DB, householdId: string): Promise<FoodPrefIndex> {
  const rows = (unwrap(
    await db
      .from('household_food_pref')
      .select('label_norm, display_label, food_id, category_key, icon_slug')
      .eq('household_id', householdId),
  ) ?? []) as Array<{
    label_norm: string;
    display_label: string;
    food_id: string | null;
    category_key: string | null;
    icon_slug: string | null;
  }>;
  const byLabel = new Map<string, FoodPref>();
  const byFood = new Map<string, FoodPref>();
  const all: FoodPref[] = [];
  for (const r of rows) {
    const pref: FoodPref = {
      labelNorm: r.label_norm,
      displayLabel: r.display_label,
      foodId: r.food_id,
      categoryKey: r.category_key,
      iconSlug: r.icon_slug,
    };
    byLabel.set(r.label_norm, pref);
    if (r.food_id) byFood.set(r.food_id, pref);
    all.push(pref);
  }
  return { byLabel, byFood, all };
}
