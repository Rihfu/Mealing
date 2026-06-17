// Unités d'aliments : liste canonique pour la saisie (UI) + réconciliation pour comparer
// besoins et stock. Regroupement par dimension (masse, volume, comptage) avec une unité de
// base par dimension. Précision approximative assumée : on ne couvre que les unités usuelles ;
// une unité inconnue est traitée comme non réconciliable (on ne déduit pas, plutôt que de
// masquer un besoin réel). Source de vérité unique, partagée par l'UI et le calcul de courses.

export type Dim = 'mass' | 'volume' | 'count';

export interface Quantity {
  dim: Dim;
  value: number; // exprimée dans l'unité de base de la dimension (g, ml, ou pièce)
}

/** Unités proposées à la saisie. `code` = valeur stockée en base ; `label` = affichage. */
export const UNIT_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: '', label: '—' },
  { code: 'pièce', label: 'pièce' },
  { code: 'g', label: 'g' },
  { code: 'kg', label: 'kg' },
  { code: 'ml', label: 'ml' },
  { code: 'cl', label: 'cl' },
  { code: 'L', label: 'L' },
  { code: 'paquet', label: 'paquet' },
  { code: 'boîte', label: 'boîte' },
  { code: 'sachet', label: 'sachet' },
  { code: 'botte', label: 'botte' },
];

const UNIT_TO_BASE: Record<string, { dim: Dim; factor: number }> = {
  mg: { dim: 'mass', factor: 0.001 },
  g: { dim: 'mass', factor: 1 },
  gramme: { dim: 'mass', factor: 1 },
  kg: { dim: 'mass', factor: 1000 },
  ml: { dim: 'volume', factor: 1 },
  cl: { dim: 'volume', factor: 10 },
  dl: { dim: 'volume', factor: 100 },
  l: { dim: 'volume', factor: 1000 },
  litre: { dim: 'volume', factor: 1000 },
  piece: { dim: 'count', factor: 1 },
  u: { dim: 'count', factor: 1 },
  unite: { dim: 'count', factor: 1 },
};

export function normalizeUnit(unit?: string | null): string {
  return (unit ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '') // retire les marques combinantes (accents) après NFD
    .replace(/s$/, '');
}

export function toBase(qty: number, unit?: string | null): Quantity | null {
  const entry = UNIT_TO_BASE[normalizeUnit(unit)];
  if (!entry) return null;
  return { dim: entry.dim, value: qty * entry.factor };
}

export function fromBase(value: number, unit?: string | null): number | null {
  const entry = UNIT_TO_BASE[normalizeUnit(unit)];
  if (!entry) return null;
  return value / entry.factor;
}
