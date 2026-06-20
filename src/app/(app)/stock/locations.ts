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

/** Vue (libellé + teinte) d'une clé de lieu (prédéfini, custom, ou « Non rangé »). */
export function locationView(key: string, customById: Map<string, string>): LocationView {
  const predef = STORAGE_LOCATIONS.find((l) => l.key === key);
  if (predef) return { key, label: predef.label, tint: PREDEFINED_TINT[key] ?? CUSTOM_TINT };
  if (key === '') return { key: '', label: 'Non rangé', tint: UNSORTED_TINT };
  return { key, label: customById.get(key) ?? 'Lieu', tint: CUSTOM_TINT };
}

/** Liste ORDONNÉE de toutes les clés de lieux (prédéfinis + custom), selon l'ordre du
 *  foyer (orderMap) puis l'ordre par défaut pour les non rangés dans la map. */
export function orderedLocationKeys(
  customLocations: Array<{ id: string }>,
  orderMap: Map<string, number>,
): string[] {
  const all = [...STORAGE_LOCATIONS.map((l) => l.key), ...customLocations.map((c) => c.id)];
  const defIdx = new Map(all.map((k, i) => [k, i]));
  return [...all].sort(
    (a, b) =>
      (orderMap.has(a) ? orderMap.get(a)! : 1000 + (defIdx.get(a) ?? 0)) -
      (orderMap.has(b) ? orderMap.get(b)! : 1000 + (defIdx.get(b) ?? 0)),
  );
}

/**
 * Groupe les articles de stock par lieu, dans l'ordre choisi par le foyer (orderMap),
 * « Non rangé » en dernier. Les groupes vides sont omis.
 */
export function groupByLocation<T extends StockGroupable>(
  items: T[],
  customLocations: Array<{ id: string; label: string }>,
  orderMap: Map<string, number>,
): Array<{ view: LocationView; items: T[] }> {
  const customById = new Map(customLocations.map((c) => [c.id, c.label]));
  // « Non rangé » EN HAUT : c'est là qu'arrivent les courses importées → incite à les ranger.
  const order: string[] = ['', ...orderedLocationKeys(customLocations, orderMap)];

  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const k = it.storageLocation ?? '';
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(it);
  }

  return order
    .filter((k) => buckets.has(k))
    .map((k) => ({ view: locationView(k, customById), items: buckets.get(k)! }));
}
