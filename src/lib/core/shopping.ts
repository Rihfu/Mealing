import type { DB } from './types';
import { unwrap } from './types';
import { loadCatalogIndex, matchCatalog } from './foods';
import { loadFoodPrefs } from './categories';
import { type Quantity, toBase, fromBase, normalizeUnit } from '@/lib/units';
import { normalizeLabel } from '@/lib/text';
import { addDays, isoDate } from '@/lib/dates';

export type ShoppingSource = 'recipe' | 'recurring' | 'manual';

export interface ShoppingLine {
  key: string; // clé stable d'état coché (ex. 'food:<id>', 'recipe-label:<txt>', 'manual:<id>')
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  source: ShoppingSource;
  manualId?: string;
  foodId?: string | null; // aliment lié (identité produit) si connu
  category?: string | null; // rayon (food.category, clé stable) pour le tri ; null = non classé
  iconSlug?: string | null; // food.external_id ('cat:<slug>') pour le picto produit
  alreadyStocked?: boolean; // (manuels) déjà couvert par le stock — anti-surplus rétroactif
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

  const stock = (unwrap(
    await db
      .from('stock')
      .select('food_id, label, tracking_mode, quantity, unit, present')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{
    food_id: string | null;
    label: string | null;
    tracking_mode: string;
    quantity: number | null;
    unit: string | null;
    present: boolean;
  }>;

  // Stock agrégé par aliment, converti dans une unité de base (cf. helpers d'unités plus bas).
  // `undefined` = pas de stock quantifié ; `null` = stock quantifié mais en unité non
  // convertible / dimensions mêlées → on ne peut pas vérifier la couverture, donc on ne déduit pas.
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

  const manual = (unwrap(
    await db
      .from('shopping_manual_item')
      .select('id, food_id, label, quantity, unit, checked')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{
    id: string;
    food_id: string | null;
    label: string;
    quantity: number | null;
    unit: string | null;
    checked: boolean;
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
  ): { foodId: string | null; category: string | null; iconSlug: string | null } => {
    let foodId: string | null = inputFoodId ?? null;
    let category: string | null = null;
    let iconSlug: string | null = null;

    if (inputFoodId && foodCategory.has(inputFoodId)) {
      category = foodCategory.get(inputFoodId) ?? null;
      iconSlug = foodSlug.get(inputFoodId) ?? null;
    } else {
      const m = matchCatalog(catalogIndex, label);
      if (m) {
        foodId = foodId ?? m.id;
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
    return { foodId, category, iconSlug };
  };

  const lines: ShoppingLine[] = [];

  for (const [foodId, need] of netNeed) {
    const key = `food:${foodId}`;
    const c = resolve(foodId, foodNames.get(foodId) ?? '');
    lines.push({
      key,
      name: foodNames.get(foodId) ?? '(aliment)',
      quantity: roundQty(need.qty),
      unit: need.unit,
      checked: checkedKeys.has(key),
      source: 'recipe',
      foodId: c.foodId,
      category: c.category,
      iconSlug: c.iconSlug,
    });
  }

  for (const [labelKey, need] of netLabelNeed) {
    const key = `recipe-label:${labelKey}`;
    const c = resolve(null, need.label);
    lines.push({
      key,
      name: need.label,
      quantity: need.qty == null ? undefined : roundQty(need.qty),
      unit: need.unit,
      checked: checkedKeys.has(key),
      source: 'recipe',
      foodId: c.foodId,
      category: c.category,
      iconSlug: c.iconSlug,
    });
  }

  for (const r of recurring) {
    if (r.food_id && presentFoods.has(r.food_id)) continue;
    if (!r.food_id && r.label && stockByLabel.get(normalizeLabel(r.label))?.present) continue;

    const key = r.food_id
      ? `recurring-food:${r.food_id}`
      : `recurring-label:${normalizeLabel(r.label ?? '')}`;
    const name = r.food_id ? (foodNames.get(r.food_id) ?? '(aliment)') : (r.label ?? '');
    const c = resolve(r.food_id, name);
    lines.push({
      key,
      name,
      quantity: r.default_quantity ?? undefined,
      unit: r.unit ?? undefined,
      checked: checkedKeys.has(key),
      source: 'recurring',
      foodId: c.foodId,
      category: c.category,
      iconSlug: c.iconSlug,
    });
  }

  for (const m of manual) {
    // Anti-surplus rétroactif (G) : un manuel n'est jamais masqué (intention explicite,
    // cf. Q2), mais on signale s'il est déjà couvert par le stock — par aliment lié ou
    // par libellé normalisé. On affiche la quantité en stock quand elle est connue.
    const stocked = stock.find(
      (s) =>
        (s.present || (s.quantity ?? 0) > 0) &&
        ((m.food_id != null && s.food_id === m.food_id) ||
          (!!s.label && normalizeLabel(s.label) === normalizeLabel(m.label))),
    );

    // Liés à la saisie : food_id direct ; sinon repli catalogue (libellé/synonyme) ;
    // la préférence foyer (déplacement/mémoire) prime dans resolve().
    const c = resolve(m.food_id, m.label);

    lines.push({
      key: `manual:${m.id}`,
      name: m.label,
      quantity: m.quantity ?? undefined,
      unit: m.unit ?? undefined,
      checked: m.checked,
      source: 'manual',
      manualId: m.id,
      foodId: c.foodId,
      category: c.category,
      iconSlug: c.iconSlug,
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
  params: { householdId: string; from: string; to: string },
): Promise<{ added: number }> {
  const lines = (await generateShoppingList(db, params)).filter((l) => l.checked);
  if (lines.length === 0) return { added: 0 };

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

  // Les achats quittent la liste.
  await db.from('shopping_item_state').delete().eq('household_id', params.householdId);
  await db
    .from('shopping_manual_item')
    .delete()
    .eq('household_id', params.householdId)
    .eq('checked', true);

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
