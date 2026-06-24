import type { DB } from './types';
import { unwrap } from './types';
import { resolveOrCreateFoodId } from './foods';
import { normalizeLabel } from '@/lib/text';

export interface RecipeIngredientInput {
  foodId?: string;
  freeText?: string;
  quantity?: number;
  unit?: string;
  /** Indices de suggestion externe (USDA / OFF) à importer si aucun foodId direct. */
  source?: string;
  externalId?: string;
}

/**
 * Construit les lignes `recipe_ingredient` en RÉSOLVANT l'identité catalogue de
 * chaque ingrédient (food_id direct → import externe → rapprochement → création de
 * fiche, via `resolveOrCreateFoodId`). C'est ce qui débloque la nutrition de
 * recette et la boucle conso→stock (qui ne lisent que les ingrédients liés). Le
 * libellé saisi reste dans `free_text` (affichage de repli). Garde-fou n°3 : aucune
 * valeur nutritionnelle n'est générée ici.
 */
async function buildIngredientRows(
  db: DB,
  recipeId: string,
  ingredients: RecipeIngredientInput[],
) {
  const rows: Array<{
    recipe_id: string;
    food_id: string | null;
    free_text: string | null;
    quantity: number | null;
    unit: string | null;
    position: number;
  }> = [];
  let position = 0;
  for (const ing of ingredients) {
    const foodId = await resolveOrCreateFoodId(db, {
      label: (ing.freeText ?? '').trim(),
      foodId: ing.foodId ?? null,
      source: ing.source ?? null,
      externalId: ing.externalId ?? null,
    });
    rows.push({
      recipe_id: recipeId,
      food_id: foodId,
      free_text: ing.freeText ?? null,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      position: position++,
    });
  }
  return rows;
}

export interface CreateRecipeInput {
  name: string;
  description?: string;
  instructions?: string;
  prepTimeMin?: number;
  cookTimeMin?: number;
  servings?: number;
  ingredients: RecipeIngredientInput[];
  tags?: string[];
}

/** Crée une recette avec ses ingrédients structurés et ses tags. */
export async function createRecipe(db: DB, input: CreateRecipeInput): Promise<string> {
  const {
    data: { user },
  } = await db.auth.getUser();

  const recipe = unwrap(
    await db
      .from('recipe')
      .insert({
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        prep_time_min: input.prepTimeMin,
        cook_time_min: input.cookTimeMin,
        servings: input.servings ?? 1,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single(),
  ) as { id: string };

  if (input.ingredients.length > 0) {
    const rows = await buildIngredientRows(db, recipe.id, input.ingredients);
    const { error } = await db.from('recipe_ingredient').insert(rows);
    if (error) throw new Error(error.message);
  }

  if (input.tags && input.tags.length > 0) {
    const tagRows = input.tags.map((tag) => ({ recipe_id: recipe.id, tag }));
    const { error } = await db.from('recipe_tag').insert(tagRows);
    if (error) throw new Error(error.message);
  }

  return recipe.id;
}

/**
 * Met à jour une recette : champs de base, puis REMPLACE intégralement les
 * ingrédients (avec résolution catalogue) et les tags (delete + reinsert). Sous
 * RLS, seul le créateur peut mettre à jour (`created_by = auth.uid()`).
 */
export async function updateRecipe(db: DB, recipeId: string, input: CreateRecipeInput): Promise<void> {
  const upd = await db
    .from('recipe')
    .update({
      name: input.name,
      description: input.description ?? null,
      instructions: input.instructions ?? null,
      prep_time_min: input.prepTimeMin ?? null,
      cook_time_min: input.cookTimeMin ?? null,
      servings: input.servings ?? 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recipeId);
  if (upd.error) throw new Error(upd.error.message);

  // Ingrédients : remplacement complet (résolution catalogue incluse).
  const delIng = await db.from('recipe_ingredient').delete().eq('recipe_id', recipeId);
  if (delIng.error) throw new Error(delIng.error.message);
  if (input.ingredients.length > 0) {
    const rows = await buildIngredientRows(db, recipeId, input.ingredients);
    const { error } = await db.from('recipe_ingredient').insert(rows);
    if (error) throw new Error(error.message);
  }

  // Tags : remplacement complet.
  const delTag = await db.from('recipe_tag').delete().eq('recipe_id', recipeId);
  if (delTag.error) throw new Error(delTag.error.message);
  if (input.tags && input.tags.length > 0) {
    const tagRows = input.tags.map((tag) => ({ recipe_id: recipeId, tag }));
    const { error } = await db.from('recipe_tag').insert(tagRows);
    if (error) throw new Error(error.message);
  }
}

/**
 * Met à jour SEULEMENT les métadonnées fournies d'une recette (nom, description,
 * portions, temps) sans toucher aux ingrédients/tags. Pratique pour l'agent IA
 * (« renomme… », « passe à 4 portions »). RLS : créateur.
 */
export async function updateRecipeFields(
  db: DB,
  recipeId: string,
  fields: { name?: string; description?: string | null; servings?: number; prepTimeMin?: number | null; cookTimeMin?: number | null },
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.servings !== undefined) patch.servings = fields.servings;
  if (fields.prepTimeMin !== undefined) patch.prep_time_min = fields.prepTimeMin;
  if (fields.cookTimeMin !== undefined) patch.cook_time_min = fields.cookTimeMin;
  const { error } = await db.from('recipe').update(patch).eq('id', recipeId);
  if (error) throw new Error(error.message);
}

/** Édits granulaires des ingrédients d'une recette (pour l'agent IA). */
export interface RecipeIngredientEdits {
  add?: Array<{ name: string; quantity?: number; unit?: string }>;
  /** Noms des ingrédients à retirer (match sur le libellé OU l'aliment lié). */
  remove?: string[];
  update?: Array<{ name: string; quantity?: number; unit?: string; newName?: string }>;
}

/**
 * Modifie les ingrédients d'une recette EXISTANTE sans tout remplacer : ajoute,
 * retire et/ou met à jour des ingrédients ciblés par leur nom. Les ajouts/renommages
 * sont reliés au catalogue (`resolveOrCreateFoodId`) ; aucune nutrition générée (n°3).
 * Bumpe `updated_at`. RLS : créateur. @returns le décompte des changements.
 */
export async function editRecipeIngredients(
  db: DB,
  recipeId: string,
  edits: RecipeIngredientEdits,
): Promise<{ added: number; removed: number; updated: number }> {
  const rows = (unwrap(
    await db.from('recipe_ingredient').select('id, free_text, position, food:food_id(name)').eq('recipe_id', recipeId),
  ) ?? []) as Array<{ id: string; free_text: string | null; position: number; food: { name: string } | { name: string }[] | null }>;
  const nameOf = (r: (typeof rows)[number]) => {
    const f = Array.isArray(r.food) ? r.food[0] : r.food;
    return normalizeLabel(f?.name ?? r.free_text ?? '');
  };
  const matches = (r: (typeof rows)[number], name: string) => nameOf(r) === normalizeLabel(name);

  let removed = 0;
  for (const name of edits.remove ?? []) {
    const ids = rows.filter((r) => matches(r, name)).map((r) => r.id);
    if (ids.length > 0) {
      const { error } = await db.from('recipe_ingredient').delete().in('id', ids);
      if (error) throw new Error(error.message);
      removed += ids.length;
    }
  }

  let updated = 0;
  for (const u of edits.update ?? []) {
    const target = rows.find((r) => matches(r, u.name));
    if (!target) continue;
    const patch: Record<string, unknown> = {};
    if (u.quantity !== undefined) patch.quantity = u.quantity;
    if (u.unit !== undefined) patch.unit = u.unit;
    if (u.newName !== undefined) {
      patch.free_text = u.newName;
      patch.food_id = await resolveOrCreateFoodId(db, { label: u.newName });
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from('recipe_ingredient').update(patch).eq('id', target.id);
      if (error) throw new Error(error.message);
      updated += 1;
    }
  }

  let nextPos = rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;
  let added = 0;
  for (const ing of edits.add ?? []) {
    const foodId = await resolveOrCreateFoodId(db, { label: ing.name });
    const { error } = await db.from('recipe_ingredient').insert({
      recipe_id: recipeId,
      food_id: foodId,
      free_text: ing.name,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      position: nextPos++,
    });
    if (error) throw new Error(error.message);
    added += 1;
  }

  await db.from('recipe').update({ updated_at: new Date().toISOString() }).eq('id', recipeId);
  return { added, removed, updated };
}

/**
 * Supprime une recette. Les ingrédients/tags partent en cascade ; `planned_meal`
 * garde ses repas (recipe_id passe à NULL — `on delete set null`). RLS : créateur.
 */
export async function deleteRecipe(db: DB, recipeId: string): Promise<void> {
  const { error } = await db.from('recipe').delete().eq('id', recipeId);
  if (error) throw new Error(error.message);
}

/**
 * Backfill : relie au catalogue les ingrédients existants laissés en `free_text`
 * (food_id null). Best-effort, idempotent — ne touche que les recettes visibles en
 * écriture (RLS = créées par l'utilisateur courant). @returns le nombre de liaisons.
 */
export async function backfillRecipeIngredientLinks(db: DB): Promise<number> {
  const rows = (unwrap(
    await db
      .from('recipe_ingredient')
      .select('id, free_text')
      .is('food_id', null)
      .not('free_text', 'is', null),
  ) ?? []) as Array<{ id: string; free_text: string | null }>;

  let linked = 0;
  for (const r of rows) {
    const label = (r.free_text ?? '').trim();
    if (!label) continue;
    const foodId = await resolveOrCreateFoodId(db, { label });
    if (!foodId) continue;
    const { error } = await db.from('recipe_ingredient').update({ food_id: foodId }).eq('id', r.id);
    if (!error) linked += 1;
  }
  return linked;
}

export interface RecipeNutrition {
  /** Total pour la recette entière, par code de nutriment. */
  total: Record<string, number>;
  /** Par portion (total / servings). */
  perServing: Record<string, number>;
  servings: number;
}

/**
 * Calcule la nutrition d'une recette À PARTIR de ses ingrédients (principe n°3 :
 * jamais saisi à la main, jamais généré par IA — toujours dérivé de la base).
 *
 * Approximation assumée (principe n°2) : on suppose que l'unité de l'ingrédient
 * correspond à l'unité de base de l'aliment (g/ml) ; le facteur d'échelle est
 * quantité / food.base_amount. Les ingrédients libres (sans food lié) sont ignorés.
 */
export async function computeRecipeNutrition(db: DB, recipeId: string): Promise<RecipeNutrition> {
  const recipe = unwrap(
    await db.from('recipe').select('servings').eq('id', recipeId).single(),
  ) as { servings: number };

  const ingredients = (unwrap(
    await db
      .from('recipe_ingredient')
      .select('food_id, quantity')
      .eq('recipe_id', recipeId),
  ) ?? []) as Array<{ food_id: string | null; quantity: number | null }>;

  const total: Record<string, number> = {};

  for (const ing of ingredients) {
    if (!ing.food_id || ing.quantity == null) continue;

    const food = unwrap(
      await db.from('food').select('base_amount').eq('id', ing.food_id).single(),
    ) as { base_amount: number };

    const values = (unwrap(
      await db
        .from('nutrient_value')
        .select('amount, nutrient_type:nutrient_type_id(code)')
        .eq('food_id', ing.food_id),
    ) ?? []) as unknown as Array<{
      amount: number;
      // Supabase peut renvoyer la relation comme objet ou tableau selon l'inférence.
      nutrient_type: { code: string } | { code: string }[] | null;
    }>;

    const factor = food.base_amount > 0 ? ing.quantity / food.base_amount : 0;

    for (const v of values) {
      const nt = v.nutrient_type;
      const code = Array.isArray(nt) ? nt[0]?.code : nt?.code;
      if (!code) continue;
      total[code] = (total[code] ?? 0) + v.amount * factor;
    }
  }

  const servings = recipe.servings > 0 ? recipe.servings : 1;
  const perServing: Record<string, number> = {};
  for (const [code, amount] of Object.entries(total)) {
    perServing[code] = amount / servings;
  }

  return { total, perServing, servings };
}
