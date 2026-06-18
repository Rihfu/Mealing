import { categoryDef, CATEGORY_ORDER } from '@/lib/product-assets';
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

/** Vue d'affichage d'un rayon (intégré ou custom) ; null = non classé (« Autres »). */
export function catView(key: string | null | undefined, customCats: HouseholdCategory[]): RayonView | null {
  const def = categoryDef(key);
  if (def) return { label: def.label, tint: def.tint, ink: def.ink, iconSlug: null, isCustom: false };
  const c = key ? customCats.find((x) => x.id === key) : undefined;
  if (c) return { label: c.label, tint: c.tint ?? 'var(--color-clay-tint)', ink: '#a96a4a', iconSlug: c.iconSlug, isCustom: true };
  return null;
}

export interface RayonGroup {
  key: string;
  view: RayonView | null; // null = rayon « Autres »
  items: ShoppingLine[];
}

/** Groupe des lignes par rayon, dans l'ordre : intégrés → personnalisés → « Autres ». */
export function groupByRayon(lines: ShoppingLine[], customCats: HouseholdCategory[]): RayonGroup[] {
  const by = new Map<string, ShoppingLine[]>();
  for (const l of lines) {
    const k = catView(l.category, customCats) ? (l.category as string) : OTHER_KEY;
    (by.get(k) ?? by.set(k, []).get(k)!).push(l);
  }
  const order = [...CATEGORY_ORDER, ...customCats.map((c) => c.id), OTHER_KEY];
  return order.filter((k) => by.has(k)).map((k) => ({ key: k, view: catView(k, customCats), items: by.get(k)! }));
}
