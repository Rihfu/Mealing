import type { DB } from './types';
import { unwrap } from './types';
import { findCatalogFoodIdByLabel } from './foods';
import type { ShoppingLine } from './shopping';
import { normalizeLabel } from '@/lib/text';

/**
 * Historique des courses (chantier juin 2026) : à chaque « J'ai fait mes courses »
 * validé, on archive un RELEVÉ daté (un trip) des articles achetés. Pur suivi des
 * achats passés — aucun lien avec le stock. Snapshot immuable (le relevé ne bouge
 * pas si le catalogue évolue). Base extensible pour de futures stats Courses.
 *
 * Toute la logique passe par core/ (principe n°4) ; les pages/actions l'appellent.
 */

export interface ShoppingTripItem {
  id: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  price: number | null; // prix payé pour la ligne (optionnel) — stats dépenses
  categoryKey: string | null; // clé de rayon (snapshot)
  foodId: string | null;
  iconSlug: string | null;
  source: string | null; // provenance principale au moment de l'achat
}

export interface ShoppingTrip {
  id: string;
  purchasedAt: string;
  isFavorite: boolean;
  name: string | null;
  items: ShoppingTripItem[];
}

export const TRIPS_PER_PAGE = 5;

type TripItemRow = {
  id: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  category_key: string | null;
  food_id: string | null;
  icon_slug: string | null;
  source: string | null;
};

function mapItem(r: TripItemRow): ShoppingTripItem {
  return {
    id: r.id,
    label: r.label,
    quantity: r.quantity,
    unit: r.unit,
    price: r.price,
    categoryKey: r.category_key,
    foodId: r.food_id,
    iconSlug: r.icon_slug,
    source: r.source,
  };
}

/**
 * Archive un relevé daté à partir des lignes achetées (lignes cochées du checkout).
 * Appelé par `checkoutPurchasedToStock`. @returns l'id du relevé (ou null si vide).
 */
export async function recordShoppingTrip(
  db: DB,
  householdId: string,
  lines: ShoppingLine[],
  prices?: Record<string, number>, // prix optionnels par clé de ligne (saisis au checkout)
): Promise<string | null> {
  if (lines.length === 0) return null;
  const trip = unwrap(
    await db.from('shopping_trip').insert({ household_id: householdId }).select('id').single(),
  ) as { id: string };

  const items = lines.map((l) => ({
    trip_id: trip.id,
    label: l.name,
    quantity: l.quantity ?? null,
    unit: l.unit ?? null,
    price: prices?.[l.key] ?? null,
    category_key: l.category ?? null,
    food_id: l.foodId ?? null,
    icon_slug: l.iconSlug ?? null,
    source: l.source ?? null,
  }));
  const { error } = await db.from('shopping_trip_item').insert(items);
  if (error) throw new Error(error.message);
  return trip.id;
}

/** Rétention de l'historique (mois) : assez profond pour les stats de rachat. */
export const TRIP_RETENTION_MONTHS = 6;

/**
 * Purge auto : supprime les relevés NON favoris de plus de `TRIP_RETENTION_MONTHS`.
 * Best-effort, appelé à l'ouverture de l'historique (pas de cron — usage perso).
 */
export async function purgeOldShoppingTrips(db: DB, householdId: string): Promise<void> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - TRIP_RETENTION_MONTHS);
  await db
    .from('shopping_trip')
    .delete()
    .eq('household_id', householdId)
    .eq('is_favorite', false)
    .lt('purchased_at', cutoff.toISOString());
}

/**
 * Page d'historique : **favoris d'abord**, puis chronologique décroissant ;
 * `TRIPS_PER_PAGE` relevés par page. `page` est 0-indexée.
 */
export async function listShoppingTrips(
  db: DB,
  householdId: string,
  page = 0,
): Promise<{ trips: ShoppingTrip[]; page: number; pageCount: number; total: number }> {
  const { count, error: countError } = await db
    .from('shopping_trip')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId);
  if (countError) throw new Error(countError.message);

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / TRIPS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const fromRow = safePage * TRIPS_PER_PAGE;

  const rows = (unwrap(
    await db
      .from('shopping_trip')
      .select(
        'id, purchased_at, is_favorite, name, shopping_trip_item(id, label, quantity, unit, price, category_key, food_id, icon_slug, source)',
      )
      .eq('household_id', householdId)
      .order('is_favorite', { ascending: false })
      .order('purchased_at', { ascending: false })
      .range(fromRow, fromRow + TRIPS_PER_PAGE - 1),
  ) ?? []) as Array<{
    id: string;
    purchased_at: string;
    is_favorite: boolean;
    name: string | null;
    shopping_trip_item: TripItemRow[] | null;
  }>;

  const trips: ShoppingTrip[] = rows.map((r) => ({
    id: r.id,
    purchasedAt: r.purchased_at,
    isFavorite: r.is_favorite,
    name: r.name,
    items: (r.shopping_trip_item ?? []).map(mapItem),
  }));
  return { trips, page: safePage, pageCount, total };
}

/** Épingle/dépingle un relevé (favori = exempté de la purge + remonté en tête). */
export async function setTripFavorite(db: DB, tripId: string, isFavorite: boolean): Promise<void> {
  const { error } = await db.from('shopping_trip').update({ is_favorite: isFavorite }).eq('id', tripId);
  if (error) throw new Error(error.message);
}

/** Renomme un relevé (nom vide → retour à l'affichage par date). */
export async function renameTrip(db: DB, tripId: string, name: string): Promise<void> {
  const clean = name.trim();
  const { error } = await db.from('shopping_trip').update({ name: clean || null }).eq('id', tripId);
  if (error) throw new Error(error.message);
}

/** Supprime un relevé (et ses articles, via cascade). */
export async function deleteTrip(db: DB, tripId: string): Promise<void> {
  const { error } = await db.from('shopping_trip').delete().eq('id', tripId);
  if (error) throw new Error(error.message);
}

/** Modifie la quantité/unité d'un article d'un relevé (édition « adaptable »). */
export async function updateTripItem(
  db: DB,
  itemId: string,
  patch: { quantity?: number | null; unit?: string | null; price?: number | null },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.unit !== undefined) row.unit = patch.unit || null;
  if (patch.price !== undefined) row.price = patch.price;
  if (Object.keys(row).length === 0) return;
  const { error } = await db.from('shopping_trip_item').update(row).eq('id', itemId);
  if (error) throw new Error(error.message);
}

/** Retire un article d'un relevé. */
export async function deleteTripItem(db: DB, itemId: string): Promise<void> {
  const { error } = await db.from('shopping_trip_item').delete().eq('id', itemId);
  if (error) throw new Error(error.message);
}

/** Retire plusieurs articles d'un relevé (ex. vider un rayon entier). */
export async function deleteTripItems(db: DB, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const { error } = await db.from('shopping_trip_item').delete().in('id', itemIds);
  if (error) throw new Error(error.message);
}

/**
 * Reconduction : ré-ajoute les articles sélectionnés d'un relevé à la liste de
 * courses actuelle (`shopping_manual_item`), liés au catalogue (food_id snapshot,
 * sinon rapprochement par libellé) → bon rayon + fusion si déjà sur la liste.
 * Le RLS sur `shopping_trip_item` garantit qu'on ne lit que les relevés du foyer.
 * @returns le nombre d'articles ré-ajoutés.
 */
export async function reconductTripItems(
  db: DB,
  householdId: string,
  itemIds: string[],
): Promise<number> {
  if (itemIds.length === 0) return 0;
  const items = (unwrap(
    await db.from('shopping_trip_item').select('label, quantity, unit, food_id').in('id', itemIds),
  ) ?? []) as Array<{ label: string; quantity: number | null; unit: string | null; food_id: string | null }>;

  const rows = await Promise.all(
    items
      .filter((it) => it.label.trim())
      .map(async (it) => ({
        household_id: householdId,
        label: it.label.trim(),
        food_id: it.food_id ?? (await findCatalogFoodIdByLabel(db, it.label)),
        quantity: it.quantity,
        unit: it.unit,
      })),
  );
  if (rows.length > 0) {
    const { error } = await db.from('shopping_manual_item').insert(rows);
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

/**
 * Dernier prix payé connu par produit (clé = food_id, sinon `l:<libellé normalisé>`),
 * pour **pré-remplir** le champ prix au checkout suivant (modifiable). Lecture seule.
 */
export async function getLastKnownPrices(db: DB, householdId: string): Promise<Record<string, number>> {
  const rows = (unwrap(
    await db
      .from('shopping_trip_item')
      .select('label, food_id, price, shopping_trip!inner(household_id, purchased_at)')
      .eq('shopping_trip.household_id', householdId)
      .not('price', 'is', null),
  ) ?? []) as Array<{
    label: string;
    food_id: string | null;
    price: number;
    shopping_trip: { purchased_at: string } | { purchased_at: string }[] | null;
  }>;

  // Pour chaque produit, on garde le prix du relevé le plus récent.
  const latest = new Map<string, { price: number; at: string }>();
  for (const r of rows) {
    const trip = Array.isArray(r.shopping_trip) ? r.shopping_trip[0] : r.shopping_trip;
    const at = trip?.purchased_at ?? '';
    const key = r.food_id ?? `l:${normalizeLabel(r.label)}`;
    const cur = latest.get(key);
    if (!cur || at > cur.at) latest.set(key, { price: r.price, at });
  }
  const out: Record<string, number> = {};
  for (const [k, v] of latest) out[k] = v.price;
  return out;
}
