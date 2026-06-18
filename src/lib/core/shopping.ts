import type { DB } from './types';
import { unwrap } from './types';
import { loadCatalogIndex, matchCatalog } from './foods';
import { loadFoodPrefs, setFoodPref } from './categories';
import { recordShoppingTrip } from './shopping-history';
import { type Quantity, type Dim, toBase, fromBase, normalizeUnit } from '@/lib/units';
import { normalizeLabel } from '@/lib/text';
import { addDays, isoDate } from '@/lib/dates';

export type ShoppingSource = 'recipe' | 'recurring' | 'manual';

export interface ShoppingLine {
  key: string; // clé stable d'identité/coché : 'cf:<foodId>' ou 'cl:<libellé normalisé>'
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  source: ShoppingSource; // provenance principale (rétro-compat)
  sources: ShoppingSource[]; // toutes les provenances fusionnées dans cette ligne
  manualId?: string; // article manuel unique (édition/suppression) si la ligne en vient d'un seul
  manualIds?: string[]; // tous les articles manuels fusionnés (pour le checkout)
  manualOnly?: boolean; // ligne issue uniquement d'ajouts manuels (qté éditable / supprimable)
  foodId?: string | null; // aliment lié (identité produit) si connu
  category?: string | null; // rayon (food.category, clé stable) pour le tri ; null = non classé
  iconSlug?: string | null; // food.external_id ('cat:<slug>') pour le picto produit
  alreadyStocked?: boolean; // déjà couvert par le stock (info, pour un ajout manuel)
  stockedLabel?: string | null; // quantité en stock à afficher (« 2 L »), '' si présence sans qté
}

/**
 * Liste de courses calculée dynamiquement (specs 3.5), jamais stockée en dur :
 *   besoins des repas à venir - stock disponible + récurrents + manuels.
 *
 * Les recettes liées à des aliments (food_id) sont calculées précisément.
 * Les recettes générées par IA peuvent contenir des ingrédients libres : on les
 * traite aussi par libellé pour éviter qu'un ingrédient évident disparaisse des
 * courses tant qu'il n'a pas encore été lié à la base nutritionnelle.
 */
export async function generateShoppingList(
  db: DB,
  params: { householdId: string; from: string; to: string },
): Promise<ShoppingLine[]> {
  const meals = (unwrap(
    await db
      .from('planned_meal')
      .select('recipe_id, meal_date')
      .eq('household_id', params.householdId)
      .gte('meal_date', params.from)
      .lte('meal_date', params.to)
      .not('recipe_id', 'is', null),
  ) ?? []) as Array<{ recipe_id: string; meal_date: string }>;

  const offDates = new Set(
    ((unwrap(
      await db
        .from('day_off_plan')
        .select('off_date, scope')
        .eq('household_id', params.householdId)
        .gte('off_date', params.from)
        .lte('off_date', params.to),
    ) ?? []) as Array<{ off_date: string; scope: string }>)
      .filter((o) => o.scope === 'household')
      .map((o) => o.off_date),
  );

  const activeRecipeIds = meals.filter((m) => !offDates.has(m.meal_date)).map((m) => m.recipe_id);

  const needByFood = new Map<string, { qty: number; unit?: string }>();
  const needByLabel = new Map<string, { label: string; qty?: number; unit?: string }>();

  if (activeRecipeIds.length > 0) {
    const ingredients = (unwrap(
      await db
        .from('recipe_ingredient')
        .select('recipe_id, food_id, free_text, quantity, unit')
        .in('recipe_id', activeRecipeIds),
    ) ?? []) as Array<{
      recipe_id: string;
      food_id: string | null;
      free_text: string | null;
      quantity: number | null;
      unit: string | null;
    }>;

    const occ = new Map<string, number>();
    for (const id of activeRecipeIds) occ.set(id, (occ.get(id) ?? 0) + 1);

    for (const ing of ingredients) {
      const times = occ.get(ing.recipe_id) ?? 1;

      if (ing.food_id) {
        if (ing.quantity == null) continue;
        const cur = needByFood.get(ing.food_id) ?? { qty: 0, unit: ing.unit ?? undefined };
        cur.qty += ing.quantity * times;
        if (!cur.unit && ing.unit) cur.unit = ing.unit;
        needByFood.set(ing.food_id, cur);
        continue;
      }

      const label = ing.free_text?.trim();
      if (!label) continue;
      const key = normalizeLabel(label);
      const cur = needByLabel.get(key) ?? { label, qty: undefined, unit: ing.unit ?? undefined };
      if (ing.quantity != null) cur.qty = (cur.qty ?? 0) + ing.quantity * times;
      if (!cur.unit && ing.unit) cur.unit = ing.unit;
      needByLabel.set(key, cur);
    }
  }

  // Stock agrégé (présence + quantités réconciliées par dimension) — logique de
  // couverture partagée avec recipeMissingIngredients (cf. loadStockCoverage).
  const { stock, presentFoods, stockBaseByFood, stockByLabel } = await loadStockCoverage(db, params.householdId);

  const neededFoodIds: string[] = [];
  const netNeed = new Map<string, { qty: number; unit?: string }>();
  for (const [foodId, need] of needByFood) {
    if (presentFoods.has(foodId)) continue; // stock en présence → on suppose la couverture
    const remaining = remainingAfterStock(need.qty, need.unit, stockBaseByFood.get(foodId));
    if (remaining > 0) {
      netNeed.set(foodId, { qty: remaining, unit: need.unit });
      neededFoodIds.push(foodId);
    }
  }

  const netLabelNeed = new Map<string, { label: string; qty?: number; unit?: string }>();
  for (const [key, need] of needByLabel) {
    const stockItem = stockByLabel.get(key);
    if (!stockItem?.present) {
      netLabelNeed.set(key, need); // pas en stock → besoin entier
      continue;
    }

    // Présent mais sans quantité chiffrée (suivi présence, ou besoin sans qté) :
    // on suppose la couverture (principe « précision approximative assumée »).
    if (need.qty == null || stockItem.qty == null) continue;

    // Stock quantifié : on déduit en unités réconciliées. En cas d'unités incompatibles,
    // `remainingAfterStock` renvoie le besoin entier — on ne masque jamais un besoin réel.
    const remaining = remainingAfterStock(need.qty, need.unit, toBase(stockItem.qty, stockItem.unit));
    if (remaining > 0) netLabelNeed.set(key, { ...need, qty: remaining });
  }

  const recurring = (unwrap(
    await db
      .from('shopping_recurring_item')
      .select('id, food_id, label, default_quantity, unit')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{
    id: string;
    food_id: string | null;
    label: string | null;
    default_quantity: number | null;
    unit: string | null;
  }>;

  // L'état coché n'est plus porté par la colonne `checked` mais par shopping_item_state
  // (clé d'identité unifiée), pour fusionner manuel + recette + récurrent sur une ligne.
  const manual = (unwrap(
    await db
      .from('shopping_manual_item')
      .select('id, food_id, label, quantity, unit')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{
    id: string;
    food_id: string | null;
    label: string;
    quantity: number | null;
    unit: string | null;
  }>;

  const recurringFoodIds = recurring.map((r) => r.food_id).filter((x): x is string => !!x);
  const manualFoodIds = manual.map((m) => m.food_id).filter((x): x is string => !!x);
  const allFoodIds = Array.from(new Set([...neededFoodIds, ...recurringFoodIds, ...manualFoodIds]));
  const foodNames = new Map<string, string>();
  const foodCategory = new Map<string, string | null>();
  const foodSlug = new Map<string, string | null>();
  if (allFoodIds.length > 0) {
    const foods = (unwrap(
      await db.from('food').select('id, name, category, external_id').in('id', allFoodIds),
    ) ?? []) as Array<{ id: string; name: string; category: string | null; external_id: string | null }>;
    for (const f of foods) {
      foodNames.set(f.id, f.name);
      foodCategory.set(f.id, f.category);
      foodSlug.set(f.id, f.external_id);
    }
  }

  const checkedKeys = new Set(
    ((unwrap(
      await db
        .from('shopping_item_state')
        .select('item_key, checked')
        .eq('household_id', params.householdId),
    ) ?? []) as Array<{ item_key: string; checked: boolean }>)
      .filter((c) => c.checked)
      .map((c) => c.item_key),
  );

  // Résolution rayon + icône + identité d'une ligne. Ordre :
  //   1) préférence FOYER (déplacement/mémoire perso) — prioritaire (perso > global) ;
  //   2) base : food.category de l'aliment lié, sinon catalogue par libellé (exact + synonymes).
  // La clé de rayon peut être intégrée ('legumes'…) ou un id de shopping_category (rayon custom).
  const catalogIndex = await loadCatalogIndex(db);
  const prefs = await loadFoodPrefs(db, params.householdId);
  const resolve = (
    inputFoodId: string | null | undefined,
    label: string,
  ): { foodId: string | null; name: string; category: string | null; iconSlug: string | null } => {
    let foodId: string | null = inputFoodId ?? null;
    let name = label;
    let category: string | null = null;
    let iconSlug: string | null = null;

    if (inputFoodId && foodCategory.has(inputFoodId)) {
      name = foodNames.get(inputFoodId) ?? label;
      category = foodCategory.get(inputFoodId) ?? null;
      iconSlug = foodSlug.get(inputFoodId) ?? null;
    } else {
      const m = matchCatalog(catalogIndex, label);
      if (m) {
        foodId = foodId ?? m.id;
        name = m.name;
        category = m.category;
        iconSlug = `cat:${m.slug}`;
      }
    }

    const pref = (foodId && prefs.byFood.get(foodId)) || prefs.byLabel.get(normalizeLabel(label));
    if (pref) {
      if (!foodId && pref.foodId) foodId = pref.foodId;
      if (pref.categoryKey) category = pref.categoryKey;
      if (pref.iconSlug) iconSlug = pref.iconSlug;
    }
    return { foodId, name, category, iconSlug };
  };

  // Fusion INTER-SOURCES : une seule ligne par identité (aliment lié OU libellé normalisé),
  // avec somme des quantités SENSIBLE AUX UNITES (g/kg, ml/cl/L... via src/lib/units).
  interface Merged {
    key: string;
    name: string;
    foodId: string | null;
    category: string | null;
    iconSlug: string | null;
    sources: Set<ShoppingSource>;
    manualIds: string[];
    acc: QtyAcc;
  }
  const merged = new Map<string, Merged>();
  const contribute = (input: {
    source: ShoppingSource;
    foodId: string | null;
    label: string;
    qty: number | null | undefined;
    unit: string | null | undefined;
    manualId?: string;
  }) => {
    const r = resolve(input.foodId, input.label);
    const key = r.foodId ? `cf:${r.foodId}` : `cl:${normalizeLabel(input.label)}`;
    let m = merged.get(key);
    if (!m) {
      m = { key, name: r.name, foodId: r.foodId, category: r.category, iconSlug: r.iconSlug, sources: new Set(), manualIds: [], acc: newQtyAcc() };
      merged.set(key, m);
    }
    m.sources.add(input.source);
    if (input.manualId) m.manualIds.push(input.manualId);
    if (!m.category && r.category) m.category = r.category;
    if (!m.iconSlug && r.iconSlug) m.iconSlug = r.iconSlug;
    addQty(m.acc, input.qty, input.unit);
  };

  for (const [foodId, need] of netNeed) {
    contribute({ source: 'recipe', foodId, label: foodNames.get(foodId) ?? '', qty: need.qty, unit: need.unit });
  }
  for (const [, need] of netLabelNeed) {
    contribute({ source: 'recipe', foodId: null, label: need.label, qty: need.qty, unit: need.unit });
  }
  for (const r of recurring) {
    if (r.food_id && presentFoods.has(r.food_id)) continue;
    if (!r.food_id && r.label && stockByLabel.get(normalizeLabel(r.label))?.present) continue;
    contribute({
      source: 'recurring',
      foodId: r.food_id,
      label: r.food_id ? (foodNames.get(r.food_id) ?? '') : (r.label ?? ''),
      qty: r.default_quantity,
      unit: r.unit,
    });
  }
  for (const m of manual) {
    contribute({ source: 'manual', foodId: m.food_id, label: m.label, qty: m.quantity, unit: m.unit, manualId: m.id });
  }

  const lines: ShoppingLine[] = [];
  for (const m of merged.values()) {
    const { quantity, unit } = finalizeQty(m.acc);
    const manualOnly = m.sources.size === 1 && m.sources.has('manual');
    // Marqueur "deja en stock" : info quand un ajout manuel est deja couvert par le stock.
    const stocked = m.sources.has('manual')
      ? stock.find(
          (s) =>
            (s.present || (s.quantity ?? 0) > 0) &&
            ((m.foodId != null && s.food_id === m.foodId) || (!!s.label && normalizeLabel(s.label) === normalizeLabel(m.name))),
        )
      : undefined;
    lines.push({
      key: m.key,
      name: m.name || '(aliment)',
      quantity,
      unit,
      checked: checkedKeys.has(m.key),
      source: m.sources.has('recipe') ? 'recipe' : m.sources.has('recurring') ? 'recurring' : 'manual',
      sources: [...m.sources],
      manualId: manualOnly && m.manualIds.length === 1 ? m.manualIds[0] : undefined,
      manualIds: m.manualIds,
      manualOnly,
      foodId: m.foodId,
      category: m.category,
      iconSlug: m.iconSlug,
      alreadyStocked: !!stocked,
      stockedLabel: stocked
        ? stocked.quantity != null
          ? `${roundQty(stocked.quantity)} ${stocked.unit ?? ''}`.trim()
          : ''
        : null,
    });
  }

  return lines;
}

/**
 * Variante de `generateShoppingList` qui classe automatiquement les lignes tombées
 * en « Autres » — typiquement le **texte libre d'une recette** (ex. « bœuf en cubes »)
 * que le catalogue + synonymes ne rapprochent pas : on demande un rayon à l'IA
 * (liste fermée, best-effort) et on le **mémorise** comme préférence foyer (une fois
 * par libellé, reclassé ensuite). Le rayon est appliqué en mémoire pour un rendu
 * immédiat. `generateShoppingList` reste pur (checkout, etc.) ; seules les pages
 * Courses utilisent cette variante. Garde-fou n°3 : le rayon n'est pas une donnée
 * nutritionnelle (les valeurs viennent toujours du fournisseur).
 */
export async function generateShoppingListAutoSorted(
  db: DB,
  params: { householdId: string; from: string; to: string },
): Promise<ShoppingLine[]> {
  const lines = await generateShoppingList(db, params);
  // Non classés = texte libre sans rayon ni aliment de catalogue (manuel/récurrent
  // déjà classés à l'ajout ; ici surtout les ingrédients libres de recette).
  const unsorted = lines.filter((l) => !l.category && !l.foodId && l.name && l.name !== '(aliment)');
  if (unsorted.length === 0) return lines;
  try {
    const { classifyImportedFood } = await import('@/lib/ai/categorize-food');
    await Promise.all(
      unsorted.slice(0, 16).map(async (l) => {
        const res = await classifyImportedFood(l.name).catch(() => null);
        if (res?.category) {
          await setFoodPref(db, params.householdId, {
            label: l.name,
            foodId: null,
            categoryKey: res.category,
            iconSlug: null,
          });
          l.category = res.category; // rendu immédiat ; mémorisé pour les prochaines fois
        }
      }),
    );
  } catch {
    // IA indisponible / erreur : on laisse ces lignes en « Autres » (best-effort).
  }
  return lines;
}

// Accumulateur de quantite sensible aux unites (somme par dimension via toBase/fromBase).
interface QtyAcc {
  any: boolean;
  raw: number;
  dim: Dim | null;
  base: number;
  convertible: boolean;
  units: Map<string, number>;
}
function newQtyAcc(): QtyAcc {
  return { any: false, raw: 0, dim: null, base: 0, convertible: true, units: new Map() };
}
function addQty(acc: QtyAcc, qty: number | null | undefined, unit: string | null | undefined): void {
  if (qty == null) return;
  acc.any = true;
  acc.raw += qty;
  if (unit) acc.units.set(unit, (acc.units.get(unit) ?? 0) + 1);
  const b = toBase(qty, unit);
  if (b == null) {
    acc.convertible = false; // unite inconnue / sans unite -> pas de conversion fiable
    return;
  }
  if (acc.dim == null) {
    acc.dim = b.dim;
    acc.base = b.value;
  } else if (acc.dim === b.dim) {
    acc.base += b.value;
  } else {
    acc.convertible = false; // dimensions melees (ex. g + L) -> repli somme brute
  }
}
/** Quantite affichee : somme convertie dans l'unite la plus frequente ; repli somme brute. */
function finalizeQty(acc: QtyAcc): { quantity?: number; unit?: string } {
  if (!acc.any) return { quantity: undefined, unit: undefined };
  let unit: string | undefined;
  let best = -1;
  for (const [u, n] of acc.units) {
    if (n > best) {
      best = n;
      unit = u;
    }
  }
  if (acc.convertible && acc.dim != null && unit) {
    const conv = fromBase(acc.base, unit);
    if (conv != null) return { quantity: roundQty(conv), unit };
  }
  return { quantity: roundQty(acc.raw), unit };
}

/**
 * « J'ai fait mes courses » (chantier E) : les lignes cochées entrent dans le stock,
 * datées d'aujourd'hui (created_at → péremption Phase 3). Fusion simple : si un article
 * de stock existe déjà (même aliment ou même libellé), on le marque présent et on cumule
 * la quantité quand l'unité correspond ; sinon on crée la ligne. Puis les achats quittent
 * la liste (coches effacées, articles manuels achetés supprimés).
 *
 * Ne touche jamais à la décrémentation (specs 3.4) : c'est un FLUX ENTRANT.
 * @returns le nombre d'articles rangés.
 */
export async function checkoutPurchasedToStock(
  db: DB,
  params: { householdId: string; from: string; to: string; prices?: Record<string, number> },
): Promise<{ added: number }> {
  const lines = (await generateShoppingList(db, params)).filter((l) => l.checked);
  if (lines.length === 0) return { added: 0 };

  // Historique des courses : on archive un relevé daté de ce qui part de la liste
  // (suivi des achats passés, sans lien avec le stock — cf. shopping-history).
  // Les prix éventuels saisis au checkout sont indexés par clé de ligne.
  await recordShoppingTrip(db, params.householdId, lines, params.prices);

  const stock = (unwrap(
    await db
      .from('stock')
      .select('id, food_id, label, tracking_mode, quantity, unit')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{
    id: string;
    food_id: string | null;
    label: string | null;
    tracking_mode: string;
    quantity: number | null;
    unit: string | null;
  }>;

  const byFood = new Map<string, (typeof stock)[number]>();
  const byLabel = new Map<string, (typeof stock)[number]>();
  for (const s of stock) {
    if (s.food_id) byFood.set(s.food_id, s);
    else if (s.label) byLabel.set(normalizeLabel(s.label), s);
  }

  let added = 0;
  for (const line of lines) {
    const existing = line.foodId ? byFood.get(line.foodId) : byLabel.get(normalizeLabel(line.name));
    const hasQty = line.quantity != null;

    if (existing) {
      const patch: Record<string, unknown> = { present: true };
      const sameUnit = normalizeUnit(existing.unit) === normalizeUnit(line.unit);
      if (hasQty && existing.tracking_mode === 'quantity' && sameUnit) {
        patch.quantity = (existing.quantity ?? 0) + (line.quantity as number);
      }
      const { error } = await db.from('stock').update(patch).eq('id', existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from('stock').insert({
        household_id: params.householdId,
        food_id: line.foodId ?? null,
        label: line.foodId ? null : line.name,
        tracking_mode: hasQty ? 'quantity' : 'presence',
        quantity: hasQty ? line.quantity : null,
        unit: line.unit ?? null,
        present: true,
      });
      if (error) throw new Error(error.message);
    }
    added++;
  }

  // Les achats quittent la liste : on efface les coches (état par identité) et on
  // supprime les articles manuels rattachés aux lignes cochées (fusion inter-sources).
  await db.from('shopping_item_state').delete().eq('household_id', params.householdId);
  const manualIds = lines.flatMap((l) => l.manualIds ?? []);
  if (manualIds.length > 0) {
    await db.from('shopping_manual_item').delete().in('id', manualIds);
  }

  return { added };
}

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Fenêtre de calcul de la liste selon la cadence du foyer (chantier H) :
 * `household.shopping_horizon_days` jours à partir d'aujourd'hui (défaut 14).
 */
export async function getShoppingWindow(
  db: DB,
  householdId: string,
): Promise<{ from: string; to: string; days: number }> {
  const hh = await db.from('household').select('shopping_horizon_days').eq('id', householdId).maybeSingle();
  if (hh.error) throw new Error(hh.error.message);
  const days = (hh.data?.shopping_horizon_days as number | null) ?? 14;
  const today = new Date();
  return { from: isoDate(today), to: isoDate(addDays(today, days - 1)), days };
}

// Réconciliation des unités (besoins vs stock) : voir `src/lib/units.ts`,
// source de vérité unique partagée avec l'UI de saisie.

function addStockBase(map: Map<string, Quantity | null>, foodId: string, base: Quantity | null): void {
  const prev = map.get(foodId);
  if (prev === undefined) {
    map.set(foodId, base);
    return;
  }
  if (prev === null || base === null || prev.dim !== base.dim) {
    map.set(foodId, null); // unité non convertible ou dimensions mêlées
    return;
  }
  map.set(foodId, { dim: prev.dim, value: prev.value + base.value });
}

/**
 * Reste à acheter après déduction du stock, exprimé dans l'unité du besoin.
 * - `stockBase` undefined (aucun stock quantifié) ou null (unité non réconciliable)
 *   → besoin entier (on ne masque jamais un besoin sur une incompatibilité d'unité).
 * - unités de dimensions différentes → besoin entier.
 * - sinon : besoin − stock, converti dans l'unité du besoin.
 */
function remainingAfterStock(
  needQty: number,
  needUnit: string | undefined,
  stockBase: Quantity | null | undefined,
): number {
  if (stockBase == null) return needQty;
  const needBase = toBase(needQty, needUnit);
  if (needBase == null || needBase.dim !== stockBase.dim) return needQty;
  const remainingBase = needBase.value - stockBase.value;
  if (remainingBase <= 0) return 0;
  return fromBase(remainingBase, needUnit) ?? remainingBase;
}

interface StockRow {
  food_id: string | null;
  label: string | null;
  tracking_mode: string;
  quantity: number | null;
  unit: string | null;
  present: boolean;
}

interface StockCoverage {
  stock: StockRow[];
  /** Aliments suivis en présence et présents (couverture supposée). */
  presentFoods: Set<string>;
  /** Stock par aliment converti en unité de base. `undefined` = pas de stock quantifié ;
   *  `null` = quantifié mais unité non réconciliable / dimensions mêlées (on ne déduit pas). */
  stockBaseByFood: Map<string, Quantity | null>;
  /** Stock par libellé normalisé (aliments libres). */
  stockByLabel: Map<string, { qty?: number; unit?: string; present: boolean }>;
}

/** Charge et agrège le stock d'un foyer pour le calcul de couverture (partagé). */
async function loadStockCoverage(db: DB, householdId: string): Promise<StockCoverage> {
  const stock = (unwrap(
    await db
      .from('stock')
      .select('food_id, label, tracking_mode, quantity, unit, present')
      .eq('household_id', householdId),
  ) ?? []) as StockRow[];

  const stockBaseByFood = new Map<string, Quantity | null>();
  const presentFoods = new Set<string>();
  const stockByLabel = new Map<string, { qty?: number; unit?: string; present: boolean }>();

  for (const s of stock) {
    if (s.food_id) {
      if (s.tracking_mode === 'quantity') {
        addStockBase(stockBaseByFood, s.food_id, toBase(s.quantity ?? 0, s.unit));
      } else if (s.present) {
        presentFoods.add(s.food_id);
      }
    }
    const label = s.label?.trim();
    if (label) {
      const key = normalizeLabel(label);
      const cur = stockByLabel.get(key) ?? { present: false, unit: s.unit ?? undefined };
      cur.present = cur.present || s.present || (s.quantity ?? 0) > 0;
      if (s.quantity != null) cur.qty = (cur.qty ?? 0) + s.quantity;
      if (!cur.unit && s.unit) cur.unit = s.unit;
      stockByLabel.set(key, cur);
    }
  }
  return { stock, presentFoods, stockBaseByFood, stockByLabel };
}

/** Un ingrédient de recette non couvert par le stock (à proposer aux courses). */
export interface RecipeMissingIngredient {
  foodId: string | null; // aliment lié (identité produit) si l'ingrédient en a un
  label: string; // nom de l'aliment lié sinon texte libre de la recette
  quantity: number | null;
  unit: string | null;
}

/**
 * Ingrédients d'une recette NON couverts par le stock du foyer — pour proposer de
 * les ajouter à la liste de courses depuis le détail recette. Même logique de
 * couverture que `generateShoppingList` (présence + réconciliation d'unités) ;
 * ne touche à rien, lecture seule.
 */
export async function recipeMissingIngredients(
  db: DB,
  householdId: string,
  recipeId: string,
): Promise<RecipeMissingIngredient[]> {
  const ingredients = (unwrap(
    await db
      .from('recipe_ingredient')
      .select('food_id, free_text, quantity, unit, food:food_id(name)')
      .eq('recipe_id', recipeId),
  ) ?? []) as Array<{
    food_id: string | null;
    free_text: string | null;
    quantity: number | null;
    unit: string | null;
    food: { name: string } | { name: string }[] | null;
  }>;

  const { presentFoods, stockBaseByFood, stockByLabel } = await loadStockCoverage(db, householdId);
  const missing: RecipeMissingIngredient[] = [];

  for (const ing of ingredients) {
    if (ing.food_id) {
      if (presentFoods.has(ing.food_id)) continue; // présence en stock → couvert
      const foodName = (Array.isArray(ing.food) ? ing.food[0] : ing.food)?.name ?? '';
      if (ing.quantity == null) {
        missing.push({ foodId: ing.food_id, label: foodName, quantity: null, unit: ing.unit });
        continue;
      }
      const remaining = remainingAfterStock(ing.quantity, ing.unit ?? undefined, stockBaseByFood.get(ing.food_id));
      if (remaining > 0) missing.push({ foodId: ing.food_id, label: foodName, quantity: roundQty(remaining), unit: ing.unit });
      continue;
    }

    const label = ing.free_text?.trim();
    if (!label) continue;
    const stockItem = stockByLabel.get(normalizeLabel(label));
    if (!stockItem?.present) {
      missing.push({ foodId: null, label, quantity: ing.quantity, unit: ing.unit });
      continue;
    }
    // Présent mais sans quantité chiffrée → couverture supposée.
    if (ing.quantity == null || stockItem.qty == null) continue;
    const remaining = remainingAfterStock(ing.quantity, ing.unit ?? undefined, toBase(stockItem.qty, stockItem.unit));
    if (remaining > 0) missing.push({ foodId: null, label, quantity: roundQty(remaining), unit: ing.unit });
  }

  return missing;
}
