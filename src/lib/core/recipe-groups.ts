import type { DB } from './types';
import { unwrap } from './types';
import { loadRecipeStockScores } from './shopping';

/**
 * Groupes de recettes personnalisables (parité Courses/Stock). Tous custom (pas de
 * prédéfinis). L'organisation est SCOPÉE FOYER et découplée de la recette (table
 * `recipe_group_item`), car la RLS de `recipe` réserve l'écriture au créateur alors
 * qu'un groupe est une décision du foyer (cf. migration 0029).
 */
export interface RecipeGroup {
  id: string;
  name: string;
  position: number;
}

/** Affectation d'une recette : son groupe (null = « Sans groupe ») + rang intra-groupe. */
export interface RecipeAssignment {
  groupId: string | null;
  sortIndex: number;
}

export async function listRecipeGroups(db: DB, householdId: string): Promise<RecipeGroup[]> {
  const rows = (unwrap(
    await db
      .from('recipe_group')
      .select('id, name, position')
      .eq('household_id', householdId)
      .order('position', { ascending: true }),
  ) ?? []) as Array<{ id: string; name: string; position: number }>;
  return rows.map((r) => ({ id: r.id, name: r.name, position: r.position }));
}

export async function createRecipeGroup(db: DB, householdId: string, name: string): Promise<string> {
  const clean = name.trim();
  const last = (unwrap(
    await db
      .from('recipe_group')
      .select('position')
      .eq('household_id', householdId)
      .order('position', { ascending: false })
      .limit(1),
  ) ?? []) as Array<{ position: number }>;
  const position = (last[0]?.position ?? -1) + 1;
  const row = unwrap(
    await db.from('recipe_group').insert({ household_id: householdId, name: clean, position }).select('id').single(),
  ) as { id: string };
  return row.id;
}

export async function renameRecipeGroup(db: DB, householdId: string, id: string, name: string): Promise<void> {
  const { error } = await db
    .from('recipe_group')
    .update({ name: name.trim() })
    .eq('id', id)
    .eq('household_id', householdId);
  if (error) throw new Error(error.message);
}

/** Supprime un groupe ; ses recettes retombent « Sans groupe » (group_id → NULL). */
export async function deleteRecipeGroup(db: DB, householdId: string, id: string): Promise<void> {
  const { error } = await db.from('recipe_group').delete().eq('id', id).eq('household_id', householdId);
  if (error) throw new Error(error.message);
}

/** Persiste l'ordre complet des groupes (positions 0..n) par foyer. */
export async function reorderRecipeGroups(db: DB, householdId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  await Promise.all(
    orderedIds.map((id, position) =>
      db.from('recipe_group').update({ position }).eq('id', id).eq('household_id', householdId),
    ),
  );
}

/**
 * Range une liste ORDONNÉE de recettes dans un groupe (group_id) + rang séquentiel.
 * Sert au glisser-déposer : déplacement (group_id change) ET réordre intra-groupe en
 * une seule écriture. `groupId = null` → « Sans groupe » (la ligne est conservée pour
 * mémoriser le rang).
 */
export async function reorderRecipesInGroup(
  db: DB,
  householdId: string,
  groupId: string | null,
  orderedRecipeIds: string[],
): Promise<void> {
  if (orderedRecipeIds.length === 0) return;
  const now = new Date().toISOString();
  const rows = orderedRecipeIds.map((recipe_id, sort_index) => ({
    household_id: householdId,
    recipe_id,
    group_id: groupId,
    sort_index,
    updated_at: now,
  }));
  const { error } = await db.from('recipe_group_item').upsert(rows, { onConflict: 'household_id,recipe_id' });
  if (error) throw new Error(error.message);
}

/** Affecte un lot de recettes à un groupe (multi-sélection). */
export async function bulkSetRecipeGroup(
  db: DB,
  householdId: string,
  recipeIds: string[],
  groupId: string | null,
): Promise<void> {
  if (recipeIds.length === 0) return;
  const now = new Date().toISOString();
  const rows = recipeIds.map((recipe_id) => ({
    household_id: householdId,
    recipe_id,
    group_id: groupId,
    sort_index: 0,
    updated_at: now,
  }));
  const { error } = await db.from('recipe_group_item').upsert(rows, { onConflict: 'household_id,recipe_id' });
  if (error) throw new Error(error.message);
}

/** Affectations recette→groupe du foyer (recipeId → {groupId, sortIndex}). */
export async function loadRecipeGroupAssignments(
  db: DB,
  householdId: string,
): Promise<Map<string, RecipeAssignment>> {
  const rows = (unwrap(
    await db.from('recipe_group_item').select('recipe_id, group_id, sort_index').eq('household_id', householdId),
  ) ?? []) as Array<{ recipe_id: string; group_id: string | null; sort_index: number }>;
  return new Map(rows.map((r) => [r.recipe_id, { groupId: r.group_id, sortIndex: r.sort_index }]));
}

/** Critères de tri des recettes (dans leur groupe) et des groupes. */
export type RecipeSortBy = 'alpha' | 'added' | 'modified' | 'frequency' | 'stock';
export type GroupSortBy = 'count' | 'alpha';

/**
 * Trie les recettes DANS leur groupe selon un critère et persiste l'ordre (sort_index).
 * Action « one-shot » (l'ordre est écrit, pas un filtre de vue) → coexiste avec le glisser.
 * - `recipeIds` fourni → réordonne UNIQUEMENT ces recettes, en place dans leurs slots
 *   (les autres ne bougent pas) ; sinon → toutes les recettes de chaque groupe.
 * Départage toujours par nom. Scopé foyer (RLS).
 */
export async function sortRecipeGroupItems(
  db: DB,
  householdId: string,
  by: RecipeSortBy,
  recipeIds?: string[],
): Promise<void> {
  const recipes = (unwrap(await db.from('recipe').select('id, name, created_at, updated_at')) ?? []) as Array<{
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>;
  const metaById = new Map(recipes.map((r) => [r.id, r]));

  // Fréquence d'utilisation = nombre de fois planifiée (planned_meal).
  const freqById = new Map<string, number>();
  if (by === 'frequency') {
    const planned = (unwrap(await db.from('planned_meal').select('recipe_id').not('recipe_id', 'is', null)) ?? []) as Array<{
      recipe_id: string | null;
    }>;
    for (const p of planned) if (p.recipe_id) freqById.set(p.recipe_id, (freqById.get(p.recipe_id) ?? 0) + 1);
  }

  // Score de réalisabilité (réutilise la couverture stock) — chargé une fois si demandé.
  const stockScores = by === 'stock' ? await loadRecipeStockScores(db, householdId) : null;

  const assignments = await loadRecipeGroupAssignments(db, householdId);
  const nameOf = (id: string) => metaById.get(id)?.name ?? '';
  const cmp = (a: string, b: string): number => {
    const ma = metaById.get(a);
    const mb = metaById.get(b);
    let d = 0;
    if (ma && mb) {
      if (by === 'alpha') d = ma.name.localeCompare(mb.name);
      else if (by === 'added') d = mb.created_at.localeCompare(ma.created_at); // plus récent d'abord
      else if (by === 'modified') d = mb.updated_at.localeCompare(ma.updated_at);
      else if (by === 'frequency') d = (freqById.get(b) ?? 0) - (freqById.get(a) ?? 0); // plus utilisée
      else d = (stockScores?.get(b) ?? 0) - (stockScores?.get(a) ?? 0); // plus réalisable d'abord
    }
    return d !== 0 ? d : nameOf(a).localeCompare(nameOf(b));
  };

  // Regroupe par groupe (clé = groupId ou null = « Sans groupe »), dans l'ordre COURANT.
  const buckets = new Map<string | null, string[]>();
  for (const r of recipes) {
    const gid = assignments.get(r.id)?.groupId ?? null;
    (buckets.get(gid) ?? buckets.set(gid, []).get(gid)!).push(r.id);
  }
  for (const ids of buckets.values()) {
    ids.sort((x, y) => (assignments.get(x)?.sortIndex ?? 0) - (assignments.get(y)?.sortIndex ?? 0) || nameOf(x).localeCompare(nameOf(y)));
  }

  const selected = recipeIds && recipeIds.length > 0 ? new Set(recipeIds) : null;
  await Promise.all(
    [...buckets.entries()].map(([gid, ids]) => {
      let ordered: string[];
      if (!selected) {
        ordered = [...ids].sort(cmp);
      } else {
        // Réordonne seulement les sélectionnées, dans les slots qu'elles occupent.
        const sortedSel = ids.filter((id) => selected.has(id)).sort(cmp);
        let k = 0;
        ordered = ids.map((id) => (selected.has(id) ? sortedSel[k++] : id));
      }
      return reorderRecipesInGroup(db, householdId, gid, ordered);
    }),
  );
}

/** Trie les GROUPES (par nombre de recettes contenues, ou alphabétique) et persiste l'ordre. */
export async function sortRecipeGroups(db: DB, householdId: string, by: GroupSortBy): Promise<void> {
  const groups = await listRecipeGroups(db, householdId);
  const counts = new Map<string, number>();
  if (by === 'count') {
    const rows = (unwrap(
      await db.from('recipe_group_item').select('group_id').eq('household_id', householdId).not('group_id', 'is', null),
    ) ?? []) as Array<{ group_id: string | null }>;
    for (const r of rows) if (r.group_id) counts.set(r.group_id, (counts.get(r.group_id) ?? 0) + 1);
  }
  const ordered = [...groups].sort((a, b) => {
    if (by === 'count') {
      const d = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
      if (d !== 0) return d;
    }
    return a.name.localeCompare(b.name);
  });
  await reorderRecipeGroups(db, householdId, ordered.map((g) => g.id));
}
