import { categoryDef, CATEGORY_ORDER, rayonInk } from '@/lib/product-assets';
import type { HouseholdCategory, ShoppingLine } from '@/lib/core';

// Résolution + groupement des rayons, partagés par la liste (`page.tsx`) et le
// mode magasin (`magasin/page.tsx`). Une clé de rayon est soit intégrée
// (product-assets), soit l'id d'un rayon personnalisé du foyer (shopping_category).

export const OTHER_KEY = 'autres';

export interface RayonView {
  label: string;
  tint: string;
  ink: string;
  iconSlug: string | null;
  isCustom: boolean;
}

/** Sous-ensemble d'un rayon custom suffisant pour l'affichage (id/label/teinte/icône). */
type CustomCat = Pick<HouseholdCategory, 'id' | 'label' | 'tint' | 'iconSlug'>;

/** Vue d'affichage d'un rayon (intégré ou custom) ; null = non classé (« Autres »). */
export function catView(key: string | null | undefined, customCats: ReadonlyArray<CustomCat>): RayonView | null {
  const def = categoryDef(key);
  if (def) return { label: def.label, tint: def.tint, ink: def.ink, iconSlug: null, isCustom: false };
  const c = key ? customCats.find((x) => x.id === key) : undefined;
  if (c) return { label: c.label, tint: c.tint ?? 'var(--color-clay-tint)', ink: rayonInk(c.tint), iconSlug: c.iconSlug, isCustom: true };
  return null;
}

export interface RayonGroup {
  key: string;
  view: RayonView | null; // null = rayon « Autres »
  items: ShoppingLine[];
}

/**
 * Ordre par défaut de TOUS les rayons (hors « Autres ») : intégrés puis customs.
 * Sert d'ordre de repli et d'univers de réordonnancement (cf. orderRayonKeys).
 */
export function defaultRayonKeys(customCats: ReadonlyArray<CustomCat>): string[] {
  return [...CATEGORY_ORDER, ...customCats.map((c) => c.id)];
}

/**
 * Applique l'ordre CHOISI par le foyer (map clé→position) à l'univers des rayons.
 * Les rayons sans position mémorisée gardent leur ordre par défaut, à la fin.
 * « Autres » n'en fait jamais partie (toujours rendu en dernier).
 */
export function orderRayonKeys(customCats: ReadonlyArray<CustomCat>, orderMap?: Map<string, number> | null): string[] {
  const all = defaultRayonKeys(customCats);
  if (!orderMap || orderMap.size === 0) return all;
  const defaultIndex = new Map(all.map((k, i) => [k, i]));
  return [...all].sort((a, b) => {
    const pa = orderMap.has(a) ? (orderMap.get(a) as number) : 1000 + (defaultIndex.get(a) ?? 0);
    const pb = orderMap.has(b) ? (orderMap.get(b) as number) : 1000 + (defaultIndex.get(b) ?? 0);
    return pa - pb;
  });
}

/**
 * Groupe des lignes par rayon. Ordre : ordre du foyer (si fourni) sinon intégrés →
 * personnalisés ; « Autres » toujours en dernier.
 */
export function groupByRayon(
  lines: ShoppingLine[],
  customCats: HouseholdCategory[],
  orderMap?: Map<string, number> | null,
  lineOrder?: Map<string, number> | null,
): RayonGroup[] {
  const by = new Map<string, ShoppingLine[]>();
  for (const l of lines) {
    const k = catView(l.category, customCats) ? (l.category as string) : OTHER_KEY;
    (by.get(k) ?? by.set(k, []).get(k)!).push(l);
  }
  const order = [...orderRayonKeys(customCats, orderMap), OTHER_KEY];
  return order
    .filter((k) => by.has(k))
    .map((k) => {
      let items = by.get(k)!;
      // Ordre manuel des lignes (glisser-déposer) : les lignes ordonnées d'abord (par
      // position), les non-ordonnées ensuite, dans leur ordre de liste (tri stable).
      if (lineOrder && lineOrder.size > 0) {
        items = [...items].sort((a, b) => {
          const pa = lineOrder.has(a.key) ? (lineOrder.get(a.key) as number) : Infinity;
          const pb = lineOrder.has(b.key) ? (lineOrder.get(b.key) as number) : Infinity;
          return pa - pb;
        });
      }
      return { key: k, view: catView(k, customCats), items };
    });
}
