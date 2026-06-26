import type { RecipeAssignment } from '@/lib/core';

/** Une tuile de recette (données affichées dans la liste). */
export interface RecipeTile {
  id: string;
  name: string;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  servings: number;
  /** L'utilisateur courant peut-il éditer/supprimer (créateur — RLS) ? */
  isOwner: boolean;
  /** URL signée de la photo de la recette (sinon icône par défaut). */
  imageUrl?: string | null;
  /** Tags de la recette (pour affichage + filtre). */
  tags: string[];
}

/** Vue d'un groupe (id null = « Sans groupe », pseudo-groupe non éditable/non triable). */
export interface RecipeGroupView {
  id: string | null;
  name: string;
}

export interface RecipeGroupSection {
  view: RecipeGroupView;
  recipes: RecipeTile[];
}

export const UNGROUPED_NAME = 'Sans groupe';

/** Clé de section pour le drag/repli : id du groupe, ou '' pour « Sans groupe ». */
export const sectionKey = (id: string | null): string => id ?? '';

/**
 * Construit les sections : tous les groupes (dans l'ordre, MÊME vides → cibles de
 * dépôt) puis « Sans groupe » en dernier. Tri intra-groupe par sortIndex puis nom.
 * Une affectation pointant vers un groupe supprimé est traitée comme « Sans groupe ».
 */
export function groupRecipes(
  recipes: RecipeTile[],
  groups: Array<{ id: string; name: string }>,
  assignments: Map<string, RecipeAssignment>,
): RecipeGroupSection[] {
  const groupIds = new Set(groups.map((g) => g.id));
  const buckets = new Map<string | null, RecipeTile[]>();
  for (const r of recipes) {
    const gid = assignments.get(r.id)?.groupId ?? null;
    const valid = gid && groupIds.has(gid) ? gid : null;
    const list = buckets.get(valid) ?? [];
    list.push(r);
    buckets.set(valid, list);
  }
  const sortFn = (a: RecipeTile, b: RecipeTile) =>
    (assignments.get(a.id)?.sortIndex ?? 0) - (assignments.get(b.id)?.sortIndex ?? 0) ||
    a.name.localeCompare(b.name);

  const sections: RecipeGroupSection[] = groups.map((g) => ({
    view: { id: g.id, name: g.name },
    recipes: (buckets.get(g.id) ?? []).slice().sort(sortFn),
  }));
  sections.push({ view: { id: null, name: UNGROUPED_NAME }, recipes: (buckets.get(null) ?? []).slice().sort(sortFn) });
  return sections;
}
