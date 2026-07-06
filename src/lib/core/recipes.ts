import type { DB } from './types';
import { unwrap } from './types';
import { resolveOrCreateFoodId, completeMissingFoodNutrition } from './foods';
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
  // Résolutions en PARALLÈLE : chacune peut enchaîner import externe + IA best-effort
  // (~secondes) — en série, sauvegarder une recette de N ingrédients nouveaux devenait
  // N fois plus lent. Mémo par identité : le même libellé n'est résolu qu'une fois
  // (évite aussi une course de création de fiche catalogue en double).
  const memo = new Map<string, Promise<string | null>>();
  const resolve = (ing: RecipeIngredientInput): Promise<string | null> => {
    const key = `${ing.foodId ?? ''}|${ing.source ?? ''}|${ing.externalId ?? ''}|${normalizeLabel(ing.freeText ?? '')}`;
    let p = memo.get(key);
    if (!p) {
      p = resolveOrCreateFoodId(db, {
        label: (ing.freeText ?? '').trim(),
        foodId: ing.foodId ?? null,
        source: ing.source ?? null,
        externalId: ing.externalId ?? null,
      });
      memo.set(key, p);
    }
    return p;
  };
  const foodIds = await Promise.all(ingredients.map(resolve));
  return ingredients.map((ing, position) => ({
    recipe_id: recipeId,
    food_id: foodIds[position],
    free_text: ing.freeText ?? null,
    quantity: ing.quantity ?? null,
    unit: ing.unit ?? null,
    position,
  }));
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
  /** Couverture des données (N0) : nombre d'ingrédients de la recette. */
  ingredientsTotal: number;
  /** … dont reliés au catalogue (`food_id`). */
  ingredientsLinked: number;
  /** … dont contribuant réellement aux chiffres (liés + quantité + valeurs stockées). */
  ingredientsWithData: number;
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
  // Recette + ingrédients en parallèle, puis aliments + valeurs BATCHÉS (2 requêtes,
  // en parallèle) au lieu de 2 requêtes PAR ingrédient en série — cette fonction est
  // sur des chemins chauds (fiche recette, agrégation Nutrition sur une période).
  const [recipeRes, ingredientsRes] = await Promise.all([
    // maybeSingle (PAS unwrap+single) : une recette invisible sous RLS (créateur parti
    // du foyer, repas orphelin…) ne doit pas faire planter toute la page Nutrition —
    // elle compte comme « sans données » (couverture honnête, principe n°2).
    db.from('recipe').select('servings').eq('id', recipeId).maybeSingle(),
    db.from('recipe_ingredient').select('food_id, quantity').eq('recipe_id', recipeId),
  ]);
  const recipe = (recipeRes.data ?? null) as { servings: number } | null;
  if (!recipe) {
    return { total: {}, perServing: {}, servings: 1, ingredientsTotal: 0, ingredientsLinked: 0, ingredientsWithData: 0 };
  }
  const ingredients = (unwrap(ingredientsRes) ?? []) as Array<{ food_id: string | null; quantity: number | null }>;

  const linked = ingredients.filter((i): i is { food_id: string; quantity: number } => !!i.food_id && i.quantity != null);
  const total: Record<string, number> = {};
  let ingredientsWithData = 0;

  if (linked.length > 0) {
    const foodIds = Array.from(new Set(linked.map((i) => i.food_id)));
    const [foodsRes, valuesRes] = await Promise.all([
      db.from('food').select('id, base_amount').in('id', foodIds),
      db.from('nutrient_value').select('food_id, amount, nutrient_type:nutrient_type_id(code)').in('food_id', foodIds),
    ]);
    const baseAmounts = new Map(
      ((unwrap(foodsRes) ?? []) as Array<{ id: string; base_amount: number }>).map((f) => [f.id, f.base_amount]),
    );
    const valuesByFood = new Map<string, Array<{ amount: number; code: string }>>();
    for (const v of (unwrap(valuesRes) ?? []) as unknown as Array<{
      food_id: string;
      amount: number;
      // Supabase peut renvoyer la relation comme objet ou tableau selon l'inférence.
      nutrient_type: { code: string } | { code: string }[] | null;
    }>) {
      const nt = v.nutrient_type;
      const code = Array.isArray(nt) ? nt[0]?.code : nt?.code;
      if (!code) continue;
      const list = valuesByFood.get(v.food_id) ?? [];
      list.push({ amount: v.amount, code });
      valuesByFood.set(v.food_id, list);
    }

    for (const ing of linked) {
      const base = baseAmounts.get(ing.food_id) ?? 0;
      const factor = base > 0 ? ing.quantity / base : 0;
      const values = valuesByFood.get(ing.food_id) ?? [];
      if (factor > 0 && values.length > 0) ingredientsWithData += 1;
      for (const v of values) {
        total[v.code] = (total[v.code] ?? 0) + v.amount * factor;
      }
    }
  }

  const servings = recipe.servings > 0 ? recipe.servings : 1;
  const perServing: Record<string, number> = {};
  for (const [code, amount] of Object.entries(total)) {
    perServing[code] = amount / servings;
  }

  return {
    total,
    perServing,
    servings,
    ingredientsTotal: ingredients.length,
    ingredientsLinked: ingredients.filter((i) => !!i.food_id).length,
    ingredientsWithData,
  };
}

/**
 * Complète en best-effort la nutrition MANQUANTE des aliments liés d'une recette
 * (N0-4 : appelé après la sauvegarde d'une recette pour que la Nutrition soit
 * calculable sans autre geste). Réutilise `completeMissingFoodNutrition` (valeurs
 * du fournisseur, jamais l'IA — garde-fou n°3). @returns le nb d'aliments complétés.
 */
export async function completeRecipeNutrition(
  db: DB,
  recipeId: string,
  opts?: { max?: number },
): Promise<number> {
  const rows = (unwrap(
    await db.from('recipe_ingredient').select('food_id').eq('recipe_id', recipeId).not('food_id', 'is', null),
  ) ?? []) as Array<{ food_id: string }>;
  if (rows.length === 0) return 0;
  const res = await completeMissingFoodNutrition(
    db,
    rows.map((r) => r.food_id),
    { max: opts?.max ?? 8, concurrency: 3 },
  );
  return res.completed;
}
