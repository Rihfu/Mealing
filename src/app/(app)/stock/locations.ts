import { STORAGE_LOCATIONS } from '@/lib/core';

/** Apparence d'un lieu (teinte + libellé). Les prédéfinis sont fixes ; les customs
 *  héritent d'une teinte neutre + leur libellé. */
export interface LocationView {
  key: string;
  label: string;
  tint: string;
}

const PREDEFINED_TINT: Record<string, string> = {
  placard: 'var(--color-butter-tint)',
  frigo: '#dce9ef',
  congelateur: '#e2ecf5',
  cave: 'var(--color-clay-tint)',
  corbeille: 'var(--color-sage-tint)',
};
const CUSTOM_TINT = 'var(--color-sage-tint)';
const UNSORTED_TINT = 'var(--color-line)';

export interface StockGroupable {
  storageLocation: string | null;
}

/**
 * Groupe les articles de stock par lieu, dans l'ordre : lieux PRÉDÉFINIS (ordre fixe)
 * → lieux PERSONNALISÉS → « Non rangé ». Les groupes vides sont omis.
 */
export function groupByLocation<T extends StockGroupable>(
  items: T[],
  customLocations: Array<{ id: string; label: string }>,
): Array<{ view: LocationView; items: T[] }> {
  const customById = new Map(customLocations.map((c) => [c.id, c.label]));
  const order: string[] = [...STORAGE_LOCATIONS.map((l) => l.key), ...customLocations.map((c) => c.id), ''];

  const view = (key: string): LocationView => {
    const predef = STORAGE_LOCATIONS.find((l) => l.key === key);
    if (predef) return { key, label: predef.label, tint: PREDEFINED_TINT[key] ?? CUSTOM_TINT };
    if (key === '') return { key: '', label: 'Non rangé', tint: UNSORTED_TINT };
    return { key, label: customById.get(key) ?? 'Lieu', tint: CUSTOM_TINT };
  };

  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const k = it.storageLocation ?? '';
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(it);
  }

  return order
    .filter((k) => buckets.has(k))
    .map((k) => ({ view: view(k), items: buckets.get(k)! }));
}
