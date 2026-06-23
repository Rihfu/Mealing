import type { DB } from './types';
import { unwrap } from './types';
import { loadCatalogIndex, matchCatalog, findCatalogFoodIdByLabel, getOrCreateCatalogFood } from './foods';
import type { CheckoutExtra } from '@/lib/offline/queue';
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
  const hh = params.householdId;

  // PERF : toutes les requêtes INDÉPENDANTES partent en parallèle (un seul aller-retour
  // au lieu d'une dizaine en série). Seules `recipe_ingredient` (dépend des repas) et
  // `food` (dépend des ids collectés) restent séquentielles ensuite.
  const [mealsRes, offRes, recurringRes, manualRes, statesRes, coverage, catalogIndex, prefs] = await Promise.all([
    db
      .from('planned_meal')
      .select('recipe_id, meal_date')
      .eq('household_id', hh)
      .gte('meal_date', params.from)
      .lte('meal_date', params.to)
      .not('recipe_id', 'is', null),
    db
      .from('day_off_plan')
      .select('off_date, scope')
      .eq('household_id', hh)
      .gte('off_date', params.from)
      .lte('off_date', params.to),
    db.from('shopping_recurring_item').select('id, food_id, label, default_quantity, unit').eq('household_id', hh),
    db.from('shopping_manual_item').select('id, food_id, label, quantity, unit').eq('household_id', hh),
    db.from('shopping_item_state').select('item_key, checked, dismissed').eq('household_id', hh),
    loadStockCoverage(db, hh),
    loadCatalogIndex(db),
    loadFoodPrefs(db, hh),
  ]);

  const meals = (unwrap(mealsRes) ?? []) as Array<{ recipe_id: string; meal_date: string }>;
  const offDates = new Set(
    ((unwrap(offRes) ?? []) as Array<{ off_date: string; scope: string }>)
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

  // Stock agrégé (présence + quantités réconciliées par dimension) — déjà chargé en
  // parallèle ci-dessus (cf. loadStockCoverage).
  const { stock, presentFoods, stockBaseByFood, stockByLabel } = coverage;

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

  // Récurrents / manuels / états : déjà chargés en parallèle ci-dessus.
  const recurring = (unwrap(recurringRes) ?? []) as Array<{
    id: string;
    food_id: string | null;
    label: string | null;
    default_quantity: number | null;
    unit: string | null;
  }>;
  // L'état coché n'est plus porté par la colonne `checked` mais par shopping_item_state
  // (clé d'identité unifiée), pour fusionner manuel + recette + récurrent sur une ligne.
  const manual = (unwrap(manualRes) ?? []) as Array<{
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

  const itemStates = (unwrap(statesRes) ?? []) as Array<{ item_key: string; checked: boolean; dismissed: boolean }>;
  const checkedKeys = new Set(itemStates.filter((c) => c.checked).map((c) => c.item_key));
  // Lignes RETIRÉES de la liste courante (≠ cochées) : masquées du rendu et du
  // checkout. Remises à zéro au passage en caisse (cf. checkoutPurchasedToStock).
  const dismissedKeys = new Set(itemStates.filter((c) => c.dismissed).map((c) => c.item_key));

  // Résolution rayon + icône + identité d'une ligne. Ordre :
  //   1) préférence FOYER (déplacement/mémoire perso) — prioritaire (perso > global) ;
  //   2) base : food.category de l'aliment lié, sinon catalogue par libellé (exact + synonymes).
  // La clé de rayon peut être intégrée ('legumes'…) ou un id de shopping_category (rayon custom).
  // (catalogIndex et prefs déjà chargés en parallèle en tête de fonction.)
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
    if (dismissedKeys.has(m.key)) continue; // ligne retirée de la liste courante
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
  params: { householdId: string; from: string; to: string; prices?: Record<string, number>; extras?: CheckoutExtra[] },
): Promise<{ added: number }> {
  const checkedLines = (await generateShoppingList(db, params)).filter((l) => l.checked);

  // Articles « ajout express » du mode magasin : absents de la liste, ils voyagent
  // avec le checkout. On les résout en lignes synthétiques (identité catalogue
  // généralisée — nom FR sans marque + rayon via l'IA, best-effort ; nutrition NON
  // touchée, garde-fou n°3), prix fusionné par clé canonique. Cf. addManualAction.
  const extraLines: ShoppingLine[] = [];
  const extraPrices: Record<string, number> = {};
  for (const ex of params.extras ?? []) {
    const label = ex.label.trim();
    if (!label) continue;
    let foodId = await findCatalogFoodIdByLabel(db, label);
    if (!foodId) {
      let cls: { name: string; category: string | null } | null = null;
      try {
        const { classifyImportedFood } = await import('@/lib/ai/categorize-food');
        cls = await classifyImportedFood(label);
      } catch {
        cls = null;
      }
      foodId = await getOrCreateCatalogFood(db, { label, name: cls?.name ?? null, category: cls?.category ?? null });
    }
    let name = label;
    let category: string | null = null;
    let iconSlug: string | null = null;
    if (foodId) {
      const { data: f } = await db.from('food').select('name, category, external_id').eq('id', foodId).maybeSingle();
      if (f) {
        const row = f as { name: string | null; category: string | null; external_id: string | null };
        name = row.name?.trim() || label;
        category = row.category ?? null;
        iconSlug = row.external_id ?? null;
      }
    }
    const key = foodId ? `cf:${foodId}` : `cl:${normalizeLabel(name)}`;
    extraLines.push({
      key,
      name,
      quantity: ex.quantity ?? undefined,
      unit: ex.unit ?? undefined,
      checked: true,
      source: 'manual',
      sources: ['manual'],
      foodId: foodId ?? null,
      category,
      iconSlug,
    });
    if (ex.price != null && ex.price > 0) extraPrices[key] = ex.price;
  }

  const lines = [...checkedLines, ...extraLines];
  if (lines.length === 0) return { added: 0 };

  // Historique des courses : on archive un relevé daté de ce qui part de la liste
  // (suivi des achats passés, sans lien avec le stock — cf. shopping-history).
  // Les prix éventuels saisis au checkout sont indexés par clé de ligne.
  await recordShoppingTrip(db, params.householdId, lines, { ...(params.prices ?? {}), ...extraPrices });

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
  // Journal des ENTRÉES (kind='in', source='courses') → alimente les stats Stock
  // (gaspillage/conso/évolution). Best-effort : n'échoue jamais le checkout.
  const inEvents: Record<string, unknown>[] = [];
  for (const line of lines) {
    const existing = line.foodId ? byFood.get(line.foodId) : byLabel.get(normalizeLabel(line.name));
    const hasQty = line.quantity != null;

    if (existing) {
      const patch: Record<string, unknown> = { present: true };
      if (hasQty && existing.tracking_mode === 'quantity') {
        // Cumul SENSIBLE AUX UNITÉS (g↔kg, ml↔cl↔L…) : même unité → somme directe ;
        // unités différentes mais réconciliables → somme en base puis re-conversion
        // dans l'unité du stock. Incompatibles (dimensions différentes / inconnues)
        // → on ne peut pas sommer fiablement : on marque présent sans fausser la qté.
        const merged = mergeStockQuantity(existing.quantity, existing.unit, line.quantity as number, line.unit);
        if (merged != null) patch.quantity = merged;
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
    inEvents.push({
      household_id: params.householdId,
      food_id: line.foodId ?? null,
      label: line.name,
      kind: 'in',
      quantity: line.quantity ?? null,
      unit: line.unit ?? null,
      source: 'courses',
    });
    added++;
  }
  // Insertion groupée (best-effort : on n'interrompt pas le checkout si le journal échoue).
  if (inEvents.length > 0) await db.from('stock_event').insert(inEvents);

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
 * Cumule une quantité entrante dans une quantité de stock existante, en réconciliant
 * les unités (cf. src/lib/units). Renvoie la nouvelle quantité exprimée dans l'unité
 * du STOCK, ou null si les unités ne se réconcilient pas (dimensions différentes /
 * inconnues) → l'appelant ne touche alors pas à la quantité (présence seulement).
 */
function mergeStockQuantity(
  stockQty: number | null,
  stockUnit: string | null | undefined,
  addQty: number,
  addUnit: string | null | undefined,
): number | null {
  const base = stockQty ?? 0;
  if (normalizeUnit(stockUnit) === normalizeUnit(addUnit)) return roundQty(base + addQty);
  const a = toBase(base, stockUnit);
  const b = toBase(addQty, addUnit);
  if (a == null || b == null || a.dim !== b.dim) return null; // incompatibles
  const sum = fromBase(a.value + b.value, stockUnit ?? undefined);
  return sum != null ? roundQty(sum) : null;
}

/**
 * RETRAIT d'une ou plusieurs lignes générées (repas/essentiel/catalogue) de la
 * liste courante (≠ cochées) : pose un marqueur `dismissed` par clé d'identité.
 * Remis à zéro au passage en caisse. Les lignes 100 % manuelles, elles, se
 * suppriment réellement (shopping_manual_item) — géré côté action.
 */
export async function dismissShoppingItems(db: DB, householdId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await db.from('shopping_item_state').upsert(
    keys.map((k) => ({ household_id: householdId, item_key: k, dismissed: true, dismissed_at: now })),
    { onConflict: 'household_id,item_key' },
  );
  if (error) throw new Error(error.message);
}

/** Annule le retrait de lignes (les fait revenir dans la liste courante). */
export async function restoreShoppingItems(db: DB, householdId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { error } = await db
    .from('shopping_item_state')
    .update({ dismissed: false, dismissed_at: null })
    .eq('household_id', householdId)
    .in('item_key', keys);
  if (error) throw new Error(error.message);
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

/** Un essentiel (produit récurrent) du foyer — affiché/géré dans « Mes essentiels ». */
export interface EssentialItem {
  id: string;
  label: string; // nom affiché (aliment lié sinon libellé)
  foodId: string | null;
  quantity: number | null;
  unit: string | null;
}

/** Liste les essentiels (produits récurrents) d'un foyer, nom résolu via le catalogue. */
export async function listRecurringItems(db: DB, householdId: string): Promise<EssentialItem[]> {
  const rows = (unwrap(
    await db
      .from('shopping_recurring_item')
      .select('id, food_id, label, default_quantity, unit, food:food_id(name)')
      .eq('household_id', householdId),
  ) ?? []) as Array<{
    id: string;
    food_id: string | null;
    label: string | null;
    default_quantity: number | null;
    unit: string | null;
    food: { name: string } | { name: string }[] | null;
  }>;
  return rows.map((r) => {
    const food = Array.isArray(r.food) ? r.food[0] : r.food;
    return {
      id: r.id,
      label: food?.name ?? r.label ?? '(aliment)',
      foodId: r.food_id,
      quantity: r.default_quantity,
      unit: r.unit,
    };
  });
}

/** Clé d'identité d'un essentiel (alignée sur les clés de stats/produits). */
export function essentialKey(e: { foodId: string | null; label: string }): string {
  return e.foodId ?? `l:${normalizeLabel(e.label)}`;
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

/**
 * Manque PRÉCIS d'un ingrédient déjà PRÉSENT en stock — pour « ingrédients manquants »
 * (constat n°1). Contrairement à `remainingAfterStock`, on NE re-propose PAS un article
 * présent quand on ne peut pas prouver le manque : pas de quantité, unité non chiffrée,
 * unités incompatibles, ou stock suffisant → `null` (couvert, précision approximative
 * assumée). Renvoie la quantité restante (dans l'unité du besoin) seulement si l'on
 * démontre un manque réel en unités compatibles.
 */
function preciseShortfall(
  needQty: number | null,
  needUnit: string | undefined,
  stockBase: Quantity | null | undefined,
): number | null {
  if (needQty == null) return null; // besoin sans quantité → couvert (présent)
  if (stockBase == null) return null; // présent mais non chiffrable / unité non réconciliable
  const needBase = toBase(needQty, needUnit);
  if (needBase == null || needBase.dim !== stockBase.dim) return null; // unités incompatibles → couvert
  const remainingBase = needBase.value - stockBase.value;
  if (remainingBase <= 0) return null; // assez en stock
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

  // Nom des aliments liés (food_id) : permet d'indexer aussi le stock lié au
  // catalogue PAR LIBELLÉ, afin qu'un besoin de recette en TEXTE LIBRE (« Œufs »,
  // « Beurre ») soit reconnu comme couvert par un article de stock lié (sinon il
  // réapparaissait à tort dans « ingrédients manquants »). Cf. constat juin 2026.
  const linkedFoodIds = Array.from(new Set(stock.map((s) => s.food_id).filter((x): x is string => !!x)));
  const foodNameById = new Map<string, string>();
  if (linkedFoodIds.length > 0) {
    const foods = (unwrap(await db.from('food').select('id, name').in('id', linkedFoodIds)) ?? []) as Array<{
      id: string;
      name: string;
    }>;
    for (const f of foods) foodNameById.set(f.id, f.name);
  }

  const stockBaseByFood = new Map<string, Quantity | null>();
  const presentFoods = new Set<string>();
  const stockByLabel = new Map<string, { qty?: number; unit?: string; present: boolean }>();

  const indexByLabel = (label: string | null | undefined, s: StockRow) => {
    const clean = label?.trim();
    if (!clean) return;
    const key = normalizeLabel(clean);
    const cur = stockByLabel.get(key) ?? { present: false, unit: s.unit ?? undefined };
    cur.present = cur.present || s.present || (s.quantity ?? 0) > 0;
    if (s.quantity != null) cur.qty = (cur.qty ?? 0) + s.quantity;
    if (!cur.unit && s.unit) cur.unit = s.unit;
    stockByLabel.set(key, cur);
  };

  for (const s of stock) {
    if (s.food_id) {
      if (s.tracking_mode === 'quantity') {
        addStockBase(stockBaseByFood, s.food_id, toBase(s.quantity ?? 0, s.unit));
      } else if (s.present) {
        presentFoods.add(s.food_id);
      }
      // Indexe aussi par le NOM de l'aliment lié (couverture des besoins en texte libre).
      indexByLabel(foodNameById.get(s.food_id), s);
    }
    indexByLabel(s.label, s);
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
      const base = stockBaseByFood.get(ing.food_id);
      if (base === undefined) {
        // Aucun stock pour cet aliment → manquant (besoin entier).
        missing.push({ foodId: ing.food_id, label: foodName, quantity: ing.quantity, unit: ing.unit });
        continue;
      }
      // En stock : COUVERT, sauf manque prouvé en unités compatibles (constat n°1 :
      // on ne re-propose pas un article déjà en stock sur une incompatibilité d'unité).
      const rem = preciseShortfall(ing.quantity, ing.unit ?? undefined, base);
      if (rem != null) missing.push({ foodId: ing.food_id, label: foodName, quantity: roundQty(rem), unit: ing.unit });
      continue;
    }

    const label = ing.free_text?.trim();
    if (!label) continue;
    const stockItem = stockByLabel.get(normalizeLabel(label));
    if (!stockItem?.present) {
      missing.push({ foodId: null, label, quantity: ing.quantity, unit: ing.unit });
      continue;
    }
    // Présent en stock → COUVERT, sauf manque prouvé en unités compatibles.
    const stockBase = stockItem.qty == null ? null : toBase(stockItem.qty, stockItem.unit);
    const rem = preciseShortfall(ing.quantity, ing.unit ?? undefined, stockBase);
    if (rem != null) missing.push({ foodId: null, label, quantity: roundQty(rem), unit: ing.unit });
  }

  return missing;
}

/** Disponibilité d'un ingrédient au regard du stock du foyer (pour la fiche recette). */
export type IngredientCoverageStatus = 'ok' | 'partial' | 'none';
export interface RecipeIngredientCoverage {
  name: string;
  foodId: string | null;
  requiredQty: number | null;
  requiredUnit: string | null;
  /** Quantité en stock à AFFICHER (dans l'unité du besoin si comparable, sinon celle du stock). */
  inStockQty: number | null;
  inStockUnit: string | null;
  present: boolean;
  status: IngredientCoverageStatus;
}

/**
 * Couverture stock de CHAQUE ingrédient d'une recette (fiche recette → code couleur +
 * « en stock : X »). Réutilise la même agrégation que `recipeMissingIngredients`
 * (`loadStockCoverage`), avec en plus une comparaison MÊME UNITÉ pour les unités non
 * convertibles en base (ex. « pièce » : « ai-je assez d'œufs ? »). Lecture seule.
 * - `ok` : présent et quantité suffisante (ou non chiffrable → on suppose couvert) ;
 * - `partial` : présent mais manque PROUVÉ en unités comparables ;
 * - `none` : absent du stock.
 */
export async function getRecipeIngredientCoverage(
  db: DB,
  householdId: string,
  recipeId: string,
): Promise<RecipeIngredientCoverage[]> {
  const ingredients = (unwrap(
    await db
      .from('recipe_ingredient')
      .select('food_id, free_text, quantity, unit, position, food:food_id(name)')
      .eq('recipe_id', recipeId)
      .order('position', { ascending: true }),
  ) ?? []) as Array<{
    food_id: string | null;
    free_text: string | null;
    quantity: number | null;
    unit: string | null;
    food: { name: string } | { name: string }[] | null;
  }>;

  const cov = await loadStockCoverage(db, householdId);

  // Agrégat de stock par aliment : somme par dimension de base (g/ml) ET par unité brute
  // (pour comparer « pièce » à « pièce »), + présence.
  const aggByFood = new Map<string, { baseByDim: Map<string, number>; byUnit: Map<string, number>; present: boolean }>();
  for (const s of cov.stock) {
    if (!s.food_id) continue;
    const agg = aggByFood.get(s.food_id) ?? { baseByDim: new Map(), byUnit: new Map(), present: false };
    if (s.present || (s.quantity ?? 0) > 0) agg.present = true;
    if (s.tracking_mode === 'quantity' && s.quantity != null) {
      const base = toBase(s.quantity, s.unit ?? undefined);
      if (base) agg.baseByDim.set(base.dim, (agg.baseByDim.get(base.dim) ?? 0) + base.value);
      const u = (s.unit ?? '').trim();
      if (u) agg.byUnit.set(u, (agg.byUnit.get(u) ?? 0) + s.quantity);
    }
    aggByFood.set(s.food_id, agg);
  }

  return ingredients.map((ing) => {
    const foodName = (Array.isArray(ing.food) ? ing.food[0] : ing.food)?.name ?? null;
    const name = foodName ?? ing.free_text ?? '';
    const req = ing.quantity;
    const reqUnit = ing.unit ?? null;

    // Calcule présence + quantité disponible comparable au besoin.
    let present = false;
    let inStockQty: number | null = null;
    let inStockUnit: string | null = null;
    let shortfall: number | null = null; // >0 = manque prouvé

    const settle = (available: number | null, unit: string | null, presence: boolean) => {
      present = presence;
      if (available != null) {
        inStockQty = roundQty(available);
        inStockUnit = unit;
        if (req != null && available + 1e-9 < req) shortfall = req - available;
      }
    };

    if (ing.food_id) {
      const agg = aggByFood.get(ing.food_id);
      if (agg) {
        const reqBase = reqUnit ? toBase(req ?? 0, reqUnit) : null;
        if (reqBase && agg.baseByDim.has(reqBase.dim)) {
          // Unité de base (g/ml) : convertit le total de stock dans l'unité du besoin.
          const totalBase = agg.baseByDim.get(reqBase.dim)!;
          settle(fromBase(totalBase, reqUnit ?? undefined) ?? totalBase, reqUnit, agg.present);
        } else if (reqUnit && agg.byUnit.has(reqUnit)) {
          settle(agg.byUnit.get(reqUnit)!, reqUnit, agg.present);
        } else if (agg.byUnit.size === 1) {
          // Pas comparable au besoin, mais une seule unité en stock → on l'affiche tel quel.
          const [u, v] = [...agg.byUnit.entries()][0];
          settle(v, u, agg.present);
          shortfall = null; // non comparable → pas de manque prouvé
        } else {
          present = agg.present;
        }
      }
    } else {
      const label = ing.free_text?.trim();
      const s = label ? cov.stockByLabel.get(normalizeLabel(label)) : undefined;
      if (s) {
        if (s.qty != null) settle(s.qty, s.unit ?? null, s.present);
        else present = s.present;
      }
    }

    const hasStock = present || inStockQty != null;
    const status: IngredientCoverageStatus = !hasStock ? 'none' : shortfall != null && shortfall > 0 ? 'partial' : 'ok';

    return { name, foodId: ing.food_id, requiredQty: req, requiredUnit: reqUnit, inStockQty, inStockUnit, present, status };
  });
}

/**
 * Score de « réalisabilité avec le stock » par recette (pour le tri Recettes
 * « Réalisable (stock) »). Score = (#ok + 0.5·#partiels) / #ingrédients ; 0 si aucun
 * ingrédient. Même logique de couverture par ingrédient que `getRecipeIngredientCoverage`
 * (présence + comparaison en unité de base OU même unité), mais batché sur TOUTES les
 * recettes en une fois (1 requête ingrédients + 1 `loadStockCoverage`). Lecture seule.
 */
export async function loadRecipeStockScores(db: DB, householdId: string): Promise<Map<string, number>> {
  const ingredients = (unwrap(
    await db.from('recipe_ingredient').select('recipe_id, food_id, free_text, quantity, unit'),
  ) ?? []) as Array<{
    recipe_id: string;
    food_id: string | null;
    free_text: string | null;
    quantity: number | null;
    unit: string | null;
  }>;

  const cov = await loadStockCoverage(db, householdId);
  const aggByFood = new Map<string, { baseByDim: Map<string, number>; byUnit: Map<string, number>; present: boolean }>();
  for (const s of cov.stock) {
    if (!s.food_id) continue;
    const agg = aggByFood.get(s.food_id) ?? { baseByDim: new Map(), byUnit: new Map(), present: false };
    if (s.present || (s.quantity ?? 0) > 0) agg.present = true;
    if (s.tracking_mode === 'quantity' && s.quantity != null) {
      const base = toBase(s.quantity, s.unit ?? undefined);
      if (base) agg.baseByDim.set(base.dim, (agg.baseByDim.get(base.dim) ?? 0) + base.value);
      const u = (s.unit ?? '').trim();
      if (u) agg.byUnit.set(u, (agg.byUnit.get(u) ?? 0) + s.quantity);
    }
    aggByFood.set(s.food_id, agg);
  }

  const statusOf = (ing: { food_id: string | null; free_text: string | null; quantity: number | null; unit: string | null }): IngredientCoverageStatus => {
    const req = ing.quantity;
    const reqUnit = ing.unit ?? undefined;
    let present = false;
    let available: number | null = null;
    if (ing.food_id) {
      const agg = aggByFood.get(ing.food_id);
      if (agg) {
        present = agg.present;
        const reqBase = reqUnit ? toBase(req ?? 0, reqUnit) : null;
        if (reqBase && agg.baseByDim.has(reqBase.dim)) available = fromBase(agg.baseByDim.get(reqBase.dim)!, reqUnit) ?? null;
        else if (reqUnit && agg.byUnit.has(reqUnit)) available = agg.byUnit.get(reqUnit)!;
      }
    } else {
      const label = ing.free_text?.trim();
      const s = label ? cov.stockByLabel.get(normalizeLabel(label)) : undefined;
      if (s) {
        present = s.present;
        if (s.qty != null) available = s.qty;
      }
    }
    const shortfall = available != null && req != null && available + 1e-9 < req;
    const hasStock = present || available != null;
    return !hasStock ? 'none' : shortfall ? 'partial' : 'ok';
  };

  const byRecipe = new Map<string, IngredientCoverageStatus[]>();
  for (const ing of ingredients) {
    (byRecipe.get(ing.recipe_id) ?? byRecipe.set(ing.recipe_id, []).get(ing.recipe_id)!).push(statusOf(ing));
  }
  const scores = new Map<string, number>();
  for (const [recipeId, statuses] of byRecipe) {
    if (statuses.length === 0) {
      scores.set(recipeId, 0);
      continue;
    }
    const s = statuses.reduce((acc, st) => acc + (st === 'ok' ? 1 : st === 'partial' ? 0.5 : 0), 0);
    scores.set(recipeId, s / statuses.length);
  }
  return scores;
}
