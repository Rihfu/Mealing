import type { DB } from './types';
import { unwrap } from './types';

/**
 * Lieux de conservation (refonte Stock). Les lieux PRÉDÉFINIS sont des constantes
 * (clés stables, comme les rayons de Courses) ; les lieux PERSONNALISÉS vivent dans
 * la table `storage_location` (scopée foyer, RLS). La clé `stock.storage_location`
 * est soit une clé prédéfinie, soit l'UUID d'un lieu custom (couplage souple, pas de FK).
 *
 * Les 3 premières clés (placard/frigo/congelateur) sont alignées sur l'estimateur de
 * conservation IA (`ai/product-conservation.ts`) → conservation intelligente par lieu.
 */
export interface StorageLocationDef {
  key: string;
  label: string;
  /** Lieu de conservation « équivalent » pour l'estimation (placard/frigo/congelateur). */
  conservationBasis: 'placard' | 'frigo' | 'congelateur';
}

export const STORAGE_LOCATIONS: StorageLocationDef[] = [
  { key: 'placard', label: 'Placard', conservationBasis: 'placard' },
  { key: 'frigo', label: 'Réfrigérateur', conservationBasis: 'frigo' },
  { key: 'congelateur', label: 'Congélateur', conservationBasis: 'congelateur' },
  { key: 'cave', label: 'Cave / cellier', conservationBasis: 'placard' },
  { key: 'corbeille', label: 'Corbeille / à l’air', conservationBasis: 'placard' },
];

const PREDEFINED = new Map(STORAGE_LOCATIONS.map((l) => [l.key, l]));

/** Définition d'un lieu prédéfini (ou null si la clé est un lieu custom / inconnue). */
export function storageDef(key: string | null): StorageLocationDef | null {
  return key ? (PREDEFINED.get(key) ?? null) : null;
}

export interface HouseholdLocation {
  id: string;
  label: string;
  iconSlug: string | null;
  position: number;
}

/** Lieux personnalisés d'un foyer (les prédéfinis sont les constantes ci-dessus). */
export async function listStorageLocations(db: DB, householdId: string): Promise<HouseholdLocation[]> {
  const rows = (unwrap(
    await db
      .from('storage_location')
      .select('id, label, icon_slug, position')
      .eq('household_id', householdId)
      .order('position', { ascending: true }),
  ) ?? []) as Array<{ id: string; label: string; icon_slug: string | null; position: number }>;
  return rows.map((r) => ({ id: r.id, label: r.label, iconSlug: r.icon_slug, position: r.position }));
}

export async function createStorageLocation(
  db: DB,
  householdId: string,
  input: { label: string; iconSlug?: string | null; position?: number },
): Promise<string> {
  const row = unwrap(
    await db
      .from('storage_location')
      .insert({
        household_id: householdId,
        label: input.label.trim(),
        icon_slug: input.iconSlug ?? null,
        position: input.position ?? 0,
      })
      .select('id')
      .single(),
  ) as { id: string };
  return row.id;
}

export async function deleteStorageLocation(db: DB, householdId: string, id: string): Promise<void> {
  // Les articles qui visaient ce lieu retombent en « non rangé » au rendu (couplage souple).
  const { error } = await db.from('storage_location').delete().eq('id', id).eq('household_id', householdId);
  if (error) throw new Error(error.message);
}

/** Affecte (ou retire) le lieu de conservation d'un article de stock. */
export async function setStockLocation(db: DB, stockId: string, locationKey: string | null): Promise<void> {
  const { error } = await db.from('stock').update({ storage_location: locationKey }).eq('id', stockId);
  if (error) throw new Error(error.message);
}

/** Libellé d'un lieu (prédéfini ou custom via la map fournie). null si introuvable. */
export function storageLabel(key: string | null, custom?: Map<string, string>): string | null {
  if (!key) return null;
  return PREDEFINED.get(key)?.label ?? custom?.get(key) ?? null;
}
