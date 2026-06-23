import type { DB } from './types';
import { unwrap } from './types';

/** Bucket Storage privé des photos de recettes (cf. migration 0030). */
export const RECIPE_IMAGE_BUCKET = 'recipe-images';

/** Chemin Storage canonique d'une photo de recette : `<household_id>/<recipe_id>.jpg`. */
export function recipeImagePath(householdId: string, recipeId: string): string {
  return `${householdId}/${recipeId}.jpg`;
}

/** Enregistre (upsert) la photo d'une recette (scopé foyer → tout membre). */
export async function setRecipeImage(db: DB, householdId: string, recipeId: string, path: string): Promise<void> {
  const { error } = await db.from('recipe_image').upsert(
    { household_id: householdId, recipe_id: recipeId, path, updated_at: new Date().toISOString() },
    { onConflict: 'household_id,recipe_id' },
  );
  if (error) throw new Error(error.message);
}

/** Retire la photo : supprime l'objet Storage puis la ligne. @returns le chemin retiré. */
export async function removeRecipeImage(db: DB, householdId: string, recipeId: string): Promise<string | null> {
  const { data } = await db
    .from('recipe_image')
    .select('path')
    .eq('household_id', householdId)
    .eq('recipe_id', recipeId)
    .maybeSingle();
  const path = (data as { path: string } | null)?.path ?? null;
  if (path) await db.storage.from(RECIPE_IMAGE_BUCKET).remove([path]);
  const { error } = await db.from('recipe_image').delete().eq('household_id', householdId).eq('recipe_id', recipeId);
  if (error) throw new Error(error.message);
  return path;
}

/** Chemins des photos du foyer (recipeId → path). */
export async function loadRecipeImagePaths(db: DB, householdId: string): Promise<Map<string, string>> {
  const rows = (unwrap(
    await db.from('recipe_image').select('recipe_id, path').eq('household_id', householdId),
  ) ?? []) as Array<{ recipe_id: string; path: string }>;
  return new Map(rows.map((r) => [r.recipe_id, r.path]));
}

/**
 * URLs signées (lecture) pour un lot de chemins. Le bucket est privé → on génère des
 * URLs temporaires (la policy SELECT autorise la signature pour les membres du foyer).
 * @returns Map path → URL signée (les chemins non signables sont omis).
 */
export async function signRecipeImageUrls(
  db: DB,
  paths: string[],
  expiresIn = 3600,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await db.storage.from(RECIPE_IMAGE_BUCKET).createSignedUrls(paths, expiresIn);
  if (error || !data) return out;
  for (const item of data) {
    if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  }
  return out;
}
