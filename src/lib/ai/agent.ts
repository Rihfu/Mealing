import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';
import type { ToolChatMessage, ToolDefinition } from '@/lib/providers/ai';
import {
  type DB,
  type MealSlot,
  // lectures
  generateShoppingListAutoSorted,
  getShoppingWindow,
  listRecurringItems,
  listHouseholdCategories,
  loadRayonOrder,
  computeProductStats,
  computeShoppingStats,
  getFoodNutrition,
  searchFoodCatalog,
  listShoppingTrips,
  findCatalogFoodIdByLabel,
  getOrCreateCatalogFood,
  type ShoppingLine,
  // stock (lecture)
  getStockWithExpiry,
  getExpiryDigest,
  listStorageLocations,
  STORAGE_LOCATIONS,
  storageLabel,
  // écritures
  createHouseholdCategory,
  setFoodPref,
  saveRayonOrder,
  reconductTripItems,
  recipeMissingIngredients,
  dismissShoppingItems,
  checkoutPurchasedToStock,
  addPlannedMeal,
  markDayOffPlan,
  reassignLeftover,
  setMealLeftover,
  copyPlannedWeek,
  recordConsumption,
  upsertStockItem,
  setStockLocation,
  removeStockItems,
  decrementStock,
  recordStockEvent,
  ensureStockConservation,
  // recettes (lecture)
  listRecipeGroups,
  loadRecipeGroupAssignments,
  loadRecipeStockScores,
  getRecipeIngredientCoverage,
  // recettes (écriture)
  createRecipe,
  createRecipeGroup,
  renameRecipeGroup,
  deleteRecipeGroup,
  bulkSetRecipeGroup,
  updateRecipeFields,
  editRecipeIngredients,
  deleteRecipe,
} from '@/lib/core';
import { categoryDef, categoryLabel, CATEGORY_ORDER } from '@/lib/product-assets';
import { isoDate, mondayOf, addDays } from '@/lib/dates';

/** Libellés FR des créneaux (affichage des repas planifiés). */
const SLOT_LABEL_FR: Record<string, string> = { breakfast: 'petit-déj', lunch: 'déjeuner', dinner: 'dîner', snack: 'collation' };

/**
 * Assistant AGENTIQUE (Phase 6, étendu à la section Courses) — boucle « tool-calling ».
 *
 * Le modèle dispose d'OUTILS DE LECTURE (liste, essentiels, rayons, historique, fiches
 * produits, stats, catalogue) exécutés immédiatement, et d'OUTILS D'ÉCRITURE qui ne sont
 * JAMAIS exécutés par l'agent : ils sont COLLECTÉS en un plan, présenté à l'utilisateur
 * qui CONFIRME par lot (principe n°1). Seul `executeAgentPlan`, appelé après confirmation,
 * écrit en base, via les fonctions `core/` (principe n°4), sous le RLS du foyer.
 *
 * Garde-fous : aucune suppression définitive (rayons/relevés) ; l'IA ne calcule jamais un
 * prix / une valeur nutritionnelle (principe n°3) — elle les LIT via les outils.
 */

type Ctx = { db: DB; householdId: string; profileId?: string };

/* ------------------------------- Schémas ---------------------------------- */

const slotEnum = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

const WRITE_SCHEMAS = {
  add_items: z.object({
    items: z
      .array(
        z.object({ label: z.string().min(1), quantity: z.number().optional(), unit: z.string().optional() }),
      )
      .min(1),
  }),
  remove_lines: z.object({ keys: z.array(z.string().min(1)).min(1) }),
  update_item: z.object({ key: z.string().min(1), quantity: z.number().nullable().optional(), unit: z.string().nullable().optional() }),
  create_rayon: z.object({ label: z.string().min(1), iconSlug: z.string().optional(), tint: z.string().optional() }),
  set_food_category: z.object({ label: z.string().min(1), categoryKey: z.string().min(1) }),
  reorder_rayons: z.object({ orderedKeys: z.array(z.string().min(1)).min(2) }),
  promote_essential: z.object({ label: z.string().min(1), quantity: z.number().optional(), unit: z.string().optional() }),
  remove_essential: z.object({ id: z.string().min(1) }),
  reconduct_trip: z.object({ tripId: z.string().min(1), itemIds: z.array(z.string()).optional() }),
  add_recipe_missing: z.object({ recipeName: z.string().min(1) }),
  checkout: z.object({}),
  add_meal: z.object({ date: z.string(), slot: slotEnum, recipeName: z.string().optional(), description: z.string().optional(), servings: z.number().positive().optional(), producesLeftover: z.boolean().optional() }),
  move_meal: z.object({ mealId: z.string().min(1), date: z.string(), slot: slotEnum }),
  remove_meal: z.object({ mealId: z.string().min(1) }),
  mark_day_off: z.object({ date: z.string() }),
  unmark_day_off: z.object({ date: z.string() }),
  set_meal_deviation: z.object({ mealId: z.string().min(1), status: z.enum(['skipped', 'different']), ate: z.string().optional() }),
  clear_meal_deviation: z.object({ mealId: z.string().min(1) }),
  reassign_leftover: z.object({ mealId: z.string().min(1), date: z.string(), slot: slotEnum, name: z.string().optional() }),
  set_meal_leftover: z.object({ mealId: z.string().min(1), produces: z.boolean() }),
  copy_week: z.object({ fromWeekStart: z.string(), toWeekStart: z.string() }),
  add_stock_item: z.object({ label: z.string().min(1), location: z.string().optional(), quantity: z.number().optional(), unit: z.string().optional() }),
  remove_stock_item: z.object({ id: z.string().min(1) }),
  discard_stock_item: z.object({ id: z.string().min(1) }),
  set_stock_location: z.object({ id: z.string().min(1), location: z.string().min(1) }),
  mark_stock_opened: z.object({ id: z.string().min(1), opened: z.boolean() }),
  decrement_stock: z.object({ id: z.string().min(1), amount: z.number().positive() }),
  estimate_conservation: z.object({}),
  // recettes
  create_recipe_group: z.object({ name: z.string().min(1) }),
  rename_recipe_group: z.object({ name: z.string().min(1), newName: z.string().min(1) }),
  delete_recipe_group: z.object({ name: z.string().min(1) }),
  assign_recipe_to_group: z.object({ recipeName: z.string().min(1), groupName: z.string().nullable().optional() }),
  update_recipe: z.object({
    recipeName: z.string().min(1),
    newName: z.string().optional(),
    description: z.string().optional(),
    servings: z.number().positive().optional(),
    prepTimeMin: z.number().nonnegative().optional(),
    cookTimeMin: z.number().nonnegative().optional(),
  }),
  save_recipe: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    servings: z.number().positive().optional(),
    prepTimeMin: z.number().nonnegative().optional(),
    cookTimeMin: z.number().nonnegative().optional(),
    ingredients: z.array(z.object({ name: z.string().min(1), quantity: z.number().optional(), unit: z.string().optional() })).min(1),
    steps: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
  edit_recipe_ingredients: z.object({
    recipeName: z.string().min(1),
    add: z.array(z.object({ name: z.string().min(1), quantity: z.number().optional(), unit: z.string().optional() })).optional(),
    remove: z.array(z.string().min(1)).optional(),
    update: z.array(z.object({ name: z.string().min(1), quantity: z.number().optional(), unit: z.string().optional(), newName: z.string().optional() })).optional(),
  }),
  delete_recipe: z.object({ recipeName: z.string().min(1) }),
} as const;

type WriteName = keyof typeof WRITE_SCHEMAS;
const WRITE_NAMES = Object.keys(WRITE_SCHEMAS) as WriteName[];
// Actions « singleton » : une seule occurrence sensée par plan (on remplace si répétée).
const SINGLETON_WRITES = new Set<WriteName>(['reorder_rayons', 'checkout', 'estimate_conservation']);

export interface ProposedAction {
  name: WriteName;
  args: Record<string, unknown>;
  summary: string;
}
export type AgentResult =
  | { type: 'reply'; message: string }
  | { type: 'plan'; message: string; actions: ProposedAction[] };

/* ------------------------------ Outils -------------------------------------- */
/* Définitions exposées au modèle (paramètres = JSON Schema). */

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties: props,
  required,
  additionalProperties: false,
});
const str = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) });
const num = (description?: string) => ({ type: 'number', ...(description ? { description } : {}) });

const READ_TOOLS: ToolDefinition[] = [
  { name: 'get_shopping_list', description: 'Liste de courses actuelle (clé `key` + `manualOnly` pour agir).', parameters: obj({}) },
  { name: 'get_essentials', description: 'Essentiels (récurrents) du foyer, avec id.', parameters: obj({}) },
  { name: 'list_rayons', description: 'Rayons (prédéfinis + perso) et leur ordre.', parameters: obj({}) },
  { name: 'get_history', description: 'Historique des courses (relevés datés + articles avec id/prix). Pour retrouver/reconduire.', parameters: obj({ page: num() }) },
  { name: 'get_product_stats', description: 'Habitudes + évolution du prix réelle d’un produit (par libellé).', parameters: obj({ label: str() }, ['label']) },
  { name: 'get_nutrition', description: 'Nutrition stockée d’un produit (par libellé).', parameters: obj({ label: str() }, ['label']) },
  { name: 'get_stats', description: 'Stats de courses (cadence, panier moyen, dépenses, à racheter).', parameters: obj({}) },
  { name: 'search_catalog', description: 'Recherche un aliment au catalogue (rayon, existence).', parameters: obj({ query: str() }, ['query']) },
  { name: 'get_stock', description: 'Stock actuel du foyer avec `id` (pour agir), lieu, quantité/présence, entamé, jours avant péremption.', parameters: obj({}) },
  { name: 'get_expiring', description: 'Articles du stock périmés / urgents / bientôt (avec id). Pour « qu’est-ce qui périme ? ».', parameters: obj({}) },
  { name: 'list_locations', description: 'Lieux de conservation (prédéfinis + perso) et leurs clés (pour ranger).', parameters: obj({}) },
  { name: 'list_recipes', description: 'Recettes du foyer (nom, groupe, temps, portions). Pour savoir ce qui existe.', parameters: obj({}) },
  { name: 'recommend_recipes', description: 'Recettes RECOMMANDÉES selon le stock actuel (les plus réalisables d’abord : score de couverture + ingrédients manquants). Pour « que puis-je cuisiner ? ».', parameters: obj({ limit: num() }) },
  { name: 'get_recipe', description: 'Détail d’une recette (par nom) : ingrédients + couverture stock (en stock / insuffisant / absent).', parameters: obj({ recipeName: str() }, ['recipeName']) },
  { name: 'list_recipe_groups', description: 'Groupes de recettes du foyer (nom + nombre de recettes).', parameters: obj({}) },
  { name: 'get_planning', description: 'Repas planifiés d’une semaine avec leur `id` (pour agir : déplacer/retirer/écart/reste). weekStart optionnel (YYYY-MM-DD, un jour de la semaine voulue) — défaut = semaine en cours. Renvoie aussi les jours hors-plan.', parameters: obj({ weekStart: str('YYYY-MM-DD (optionnel)') }) },
];

const WRITE_TOOLS: ToolDefinition[] = [
  { name: 'add_items', description: 'Ajoute des articles à la liste.', parameters: obj({ items: { type: 'array', items: obj({ label: str(), quantity: num(), unit: str() }, ['label']) } }, ['items']) },
  { name: 'remove_lines', description: 'Retire des articles (réversible) via les `key` de get_shopping_list.', parameters: obj({ keys: { type: 'array', items: str() } }, ['keys']) },
  { name: 'update_item', description: 'Change quantité/unité d’un article manuel (key manualOnly).', parameters: obj({ key: str(), quantity: num(), unit: str() }, ['key']) },
  { name: 'create_rayon', description: 'Crée un rayon personnalisé.', parameters: obj({ label: str(), iconSlug: str(), tint: str() }, ['label']) },
  { name: 'set_food_category', description: 'Range un aliment dans un rayon (categoryKey de list_rayons).', parameters: obj({ label: str(), categoryKey: str() }, ['label', 'categoryKey']) },
  { name: 'reorder_rayons', description: 'Réordonne TOUS les rayons : liste complète des clés dans le nouvel ordre.', parameters: obj({ orderedKeys: { type: 'array', items: str() } }, ['orderedKeys']) },
  { name: 'promote_essential', description: 'Marque un produit comme essentiel.', parameters: obj({ label: str(), quantity: num(), unit: str() }, ['label']) },
  { name: 'remove_essential', description: 'Retire un essentiel (id de get_essentials).', parameters: obj({ id: str() }, ['id']) },
  { name: 'reconduct_trip', description: 'Reconduit une liste passée (tripId de get_history ; itemIds optionnel).', parameters: obj({ tripId: str(), itemIds: { type: 'array', items: str() } }, ['tripId']) },
  { name: 'add_recipe_missing', description: 'Ajoute les ingrédients manquants d’une recette.', parameters: obj({ recipeName: str() }, ['recipeName']) },
  { name: 'checkout', description: 'Valide les courses (cochés → stock + relevé). Seulement si demandé.', parameters: obj({}) },
  { name: 'add_meal', description: 'Planifie un repas (recette OU description libre). servings = portions, producesLeftover = produit un reste replanifiable.', parameters: obj({ date: str('YYYY-MM-DD'), slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] }, recipeName: str(), description: str(), servings: num(), producesLeftover: { type: 'boolean' } }, ['date', 'slot']) },
  { name: 'move_meal', description: 'Déplace un repas vers un autre jour/créneau. mealId = id de get_planning.', parameters: obj({ mealId: str(), date: str('YYYY-MM-DD'), slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] } }, ['mealId', 'date', 'slot']) },
  { name: 'remove_meal', description: 'Retire un repas du planning. mealId de get_planning.', parameters: obj({ mealId: str() }, ['mealId']) },
  { name: 'mark_day_off', description: 'Marque une journée entière hors-plan (absent/vacances).', parameters: obj({ date: str('YYYY-MM-DD') }, ['date']) },
  { name: 'unmark_day_off', description: 'Réactive le suivi d’une journée hors-plan.', parameters: obj({ date: str('YYYY-MM-DD') }, ['date']) },
  { name: 'set_meal_deviation', description: 'Signale un écart sur un repas : status « skipped » (sauté) ou « different » (mangé autre chose → `ate`). mealId de get_planning.', parameters: obj({ mealId: str(), status: { type: 'string', enum: ['skipped', 'different'] }, ate: str() }, ['mealId', 'status']) },
  { name: 'clear_meal_deviation', description: 'Annule l’écart d’un repas (retour « comme prévu »). mealId de get_planning.', parameters: obj({ mealId: str() }, ['mealId']) },
  { name: 'reassign_leftover', description: 'Replanifie un RESTE d’un repas (qui produit un reste) vers un créneau ; `name` optionnel = plat improvisé (sinon « Reste : … »). Aucun nouveau besoin de courses. mealId = repas-source de get_planning.', parameters: obj({ mealId: str(), date: str('YYYY-MM-DD'), slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] }, name: str() }, ['mealId', 'date', 'slot']) },
  { name: 'set_meal_leftover', description: 'Marque (produces=true) ou non (false) qu’un repas produit un reste replanifiable. mealId de get_planning.', parameters: obj({ mealId: str(), produces: { type: 'boolean' } }, ['mealId', 'produces']) },
  { name: 'copy_week', description: 'Duplique les repas d’une semaine vers une autre (réutilisation). fromWeekStart/toWeekStart = un jour de chaque semaine (YYYY-MM-DD).', parameters: obj({ fromWeekStart: str('YYYY-MM-DD'), toWeekStart: str('YYYY-MM-DD') }, ['fromWeekStart', 'toWeekStart']) },
  { name: 'add_stock_item', description: 'Ajoute un article au stock (label requis ; location = clé de list_locations, quantity/unit optionnels).', parameters: obj({ label: str(), location: str(), quantity: num(), unit: str() }, ['label']) },
  { name: 'remove_stock_item', description: 'Retire un article du stock SANS gaspillage (correction/doublon). id de get_stock.', parameters: obj({ id: str() }, ['id']) },
  { name: 'discard_stock_item', description: 'JETER un article (périmé/gâché) — compte comme GASPILLAGE. id de get_stock.', parameters: obj({ id: str() }, ['id']) },
  { name: 'set_stock_location', description: 'Range un article dans un lieu (location = clé de list_locations). id de get_stock.', parameters: obj({ id: str(), location: str() }, ['id', 'location']) },
  { name: 'mark_stock_opened', description: 'Marque un article entamé (opened=true) ou non (false). id de get_stock.', parameters: obj({ id: str(), opened: { type: 'boolean' } }, ['id', 'opened']) },
  { name: 'decrement_stock', description: 'Consomme une quantité d’un article (mode quantité). id de get_stock + amount > 0.', parameters: obj({ id: str(), amount: num() }, ['id', 'amount']) },
  { name: 'estimate_conservation', description: 'Estime la durée de conservation des articles du stock qui n’en ont pas encore.', parameters: obj({}) },
  { name: 'create_recipe_group', description: 'Crée un groupe de recettes (ex. « Petit déjeuner »).', parameters: obj({ name: str() }, ['name']) },
  { name: 'rename_recipe_group', description: 'Renomme un groupe de recettes (par son nom actuel).', parameters: obj({ name: str(), newName: str() }, ['name', 'newName']) },
  { name: 'delete_recipe_group', description: 'Supprime un groupe de recettes (les recettes retombent « Sans groupe », non perdues).', parameters: obj({ name: str() }, ['name']) },
  { name: 'assign_recipe_to_group', description: 'Range une recette dans un groupe (groupName vide/null = Sans groupe).', parameters: obj({ recipeName: str(), groupName: str() }, ['recipeName']) },
  { name: 'update_recipe', description: 'Modifie une recette (nom/description/portions/temps). Ne touche PAS aux ingrédients.', parameters: obj({ recipeName: str(), newName: str(), description: str(), servings: num(), prepTimeMin: num(), cookTimeMin: num() }, ['recipeName']) },
  { name: 'save_recipe', description: 'Enregistre une NOUVELLE recette dans la bibliothèque (ex. une suggestion à partir du stock). Fournis nom + ingredients [{name, quantity, unit}] + steps. Les ingrédients sont reliés au catalogue ; la nutrition est calculée depuis la base — n’invente JAMAIS de valeurs nutritionnelles.', parameters: obj({ name: str(), description: str(), servings: num(), prepTimeMin: num(), cookTimeMin: num(), ingredients: { type: 'array', items: obj({ name: str(), quantity: num(), unit: str() }, ['name']) }, steps: { type: 'array', items: str() }, tags: { type: 'array', items: str() } }, ['name', 'ingredients']) },
  { name: 'edit_recipe_ingredients', description: 'Modifie les INGRÉDIENTS d’une recette existante (sans tout remplacer) : `add` [{name,quantity,unit}], `remove` [noms], `update` [{name, quantity, unit, newName}]. Cible chaque ingrédient par son NOM. Les ajouts/renommages sont reliés au catalogue.', parameters: obj({ recipeName: str(), add: { type: 'array', items: obj({ name: str(), quantity: num(), unit: str() }, ['name']) }, remove: { type: 'array', items: str() }, update: { type: 'array', items: obj({ name: str(), quantity: num(), unit: str(), newName: str() }, ['name']) } }, ['recipeName']) },
  { name: 'delete_recipe', description: 'SUPPRIME définitivement une recette (par nom). Action destructive → toujours confirmée par l’utilisateur. Les repas déjà planifiés conservent leur nom (recipe_id passe à null).', parameters: obj({ recipeName: str() }, ['recipeName']) },
];

/* --------------------------- Lectures (exécutées) --------------------------- */

async function currentLines(ctx: Ctx): Promise<ShoppingLine[]> {
  const { from, to } = await getShoppingWindow(ctx.db, ctx.householdId);
  return generateShoppingListAutoSorted(ctx.db, { householdId: ctx.householdId, from, to });
}

/** Résout une recette par nom (sous-chaîne, insensible à la casse). */
async function findRecipe(db: DB, name: string): Promise<{ id: string; name: string } | null> {
  const q = name.trim();
  if (!q) return null;
  const { data } = await db.from('recipe').select('id, name').ilike('name', `%${q}%`).limit(1).maybeSingle();
  return data ? { id: (data as { id: string }).id, name: (data as { name: string }).name } : null;
}

/** Résout un groupe de recettes par nom (exact puis sous-chaîne). */
async function findRecipeGroup(db: DB, householdId: string, name: string): Promise<{ id: string; name: string } | null> {
  const groups = await listRecipeGroups(db, householdId);
  const n = name.trim().toLowerCase();
  return groups.find((g) => g.name.toLowerCase() === n) ?? groups.find((g) => g.name.toLowerCase().includes(n)) ?? null;
}

async function runReadTool(ctx: Ctx, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_shopping_list': {
      const lines = await currentLines(ctx);
      const active = lines.filter((l) => !l.checked);
      const done = lines.filter((l) => l.checked);
      return JSON.stringify({
        a_acheter: active.map((l) => ({ key: l.key, nom: l.name, qte: l.quantity ?? null, unite: l.unit ?? null, rayon: categoryLabel(l.category ?? null), provenance: l.sources, deja_en_stock: !!l.alreadyStocked, manualOnly: !!l.manualOnly })),
        deja_pris: done.map((l) => l.name),
      });
    }
    case 'get_essentials':
      return JSON.stringify((await listRecurringItems(ctx.db, ctx.householdId)).map((e) => ({ id: e.id, nom: e.label, qte: e.quantity, unite: e.unit })));
    case 'list_rayons': {
      const [cats, order] = await Promise.all([listHouseholdCategories(ctx.db, ctx.householdId), loadRayonOrder(ctx.db, ctx.householdId)]);
      const predefined = CATEGORY_ORDER.map((key) => ({ key, label: categoryDef(key)?.label ?? key, type: 'prédéfini' }));
      const custom = cats.map((c) => ({ key: c.id, label: c.label, type: 'personnalisé' }));
      const ordered = [...predefined, ...custom].sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
      return JSON.stringify(ordered);
    }
    case 'get_history': {
      const page = typeof args.page === 'number' ? args.page : 0;
      const { trips, pageCount } = await listShoppingTrips(ctx.db, ctx.householdId, page);
      return JSON.stringify({
        page,
        pages_total: pageCount,
        relevés: trips.map((t) => ({ tripId: t.id, date: t.purchasedAt.slice(0, 10), favori: t.isFavorite, nom: t.name, articles: t.items.map((i) => ({ itemId: i.id, nom: i.label, qte: i.quantity, unite: i.unit, prix: i.price })) })),
      });
    }
    case 'get_product_stats': {
      const foodId = await findCatalogFoodIdByLabel(ctx.db, String(args.label ?? ''));
      if (!foodId) return JSON.stringify({ trouvé: false, note: 'Produit non reconnu dans le catalogue.' });
      const d = await computeProductStats(ctx.db, ctx.householdId, foodId);
      if (!d) return JSON.stringify({ trouvé: false });
      return JSON.stringify({ trouvé: true, nom: d.name, achats: d.count, dernier_prix: d.lastPrice, prix_moyen: d.avgPrice, prix_min: d.minPrice, prix_max: d.maxPrice, intervalle_jours: d.medianIntervalDays, jours_depuis_dernier: d.daysSinceLast, evolution_prix: d.priceHistory });
    }
    case 'get_nutrition': {
      const foodId = await findCatalogFoodIdByLabel(ctx.db, String(args.label ?? ''));
      if (!foodId) return JSON.stringify({ trouvé: false });
      const n = await getFoodNutrition(ctx.db, foodId);
      return JSON.stringify({ trouvé: !!n?.length, pour_100: n?.map((v) => ({ nom: v.name, valeur: v.amount, unite: v.unit })) ?? [] });
    }
    case 'get_stats':
      return JSON.stringify(await computeShoppingStats(ctx.db, ctx.householdId));
    case 'search_catalog': {
      const res = await searchFoodCatalog(ctx.db, String(args.query ?? ''));
      return JSON.stringify(res.slice(0, 8).map((s) => ({ nom: s.name, rayon: categoryLabel(s.category ?? null), dejaImporte: !!s.foodId })));
    }
    case 'get_stock': {
      const [expiries, customLocs] = await Promise.all([
        getStockWithExpiry(ctx.db, ctx.householdId),
        listStorageLocations(ctx.db, ctx.householdId),
      ]);
      const customMap = new Map(customLocs.map((l) => [l.id, l.label]));
      const { data } = await ctx.db
        .from('stock')
        .select('id, tracking_mode, quantity, unit, present')
        .eq('household_id', ctx.householdId);
      const byId = new Map(
        ((data ?? []) as Array<{ id: string; tracking_mode: string; quantity: number | null; unit: string | null; present: boolean }>).map((r) => [r.id, r]),
      );
      return JSON.stringify(
        expiries.map((e) => {
          const r = byId.get(e.id);
          return {
            id: e.id,
            nom: e.name,
            lieu: storageLabel(e.storageLocation, customMap) ?? 'non rangé',
            suivi: r?.tracking_mode === 'quantity' ? 'quantité' : 'présence',
            qte: r?.tracking_mode === 'quantity' ? (r?.quantity ?? null) : null,
            unite: r?.unit ?? null,
            entame: e.opened,
            jours_avant_peremption: e.daysRemaining,
            source_peremption: e.expirySource,
          };
        }),
      );
    }
    case 'get_expiring': {
      const d = await getExpiryDigest(ctx.db, ctx.householdId);
      const fmt = (arr: typeof d.expired) => arr.map((i) => ({ id: i.id, nom: i.name, jours: i.daysRemaining }));
      return JSON.stringify({ seuil: d.threshold, total: d.total, perimes: fmt(d.expired), urgents: fmt(d.urgent), bientot: fmt(d.soon) });
    }
    case 'list_locations': {
      const custom = await listStorageLocations(ctx.db, ctx.householdId);
      return JSON.stringify([
        ...STORAGE_LOCATIONS.map((l) => ({ key: l.key, label: l.label, type: 'prédéfini' })),
        ...custom.map((c) => ({ key: c.id, label: c.label, type: 'personnalisé' })),
      ]);
    }
    case 'list_recipes': {
      const [recipesRes, groups, assignments] = await Promise.all([
        ctx.db.from('recipe').select('id, name, prep_time_min, cook_time_min, servings').order('name', { ascending: true }),
        listRecipeGroups(ctx.db, ctx.householdId),
        loadRecipeGroupAssignments(ctx.db, ctx.householdId),
      ]);
      const groupName = new Map(groups.map((g) => [g.id, g.name]));
      const rows = (recipesRes.data ?? []) as Array<{ id: string; name: string; prep_time_min: number | null; cook_time_min: number | null; servings: number }>;
      return JSON.stringify(
        rows.map((r) => {
          const gid = assignments.get(r.id)?.groupId;
          return { nom: r.name, groupe: gid ? groupName.get(gid) ?? null : null, minutes: (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0), portions: r.servings };
        }),
      );
    }
    case 'recommend_recipes': {
      const limit = Math.max(1, Math.min(typeof args.limit === 'number' ? args.limit : 5, 15));
      const [recipesRes, scores] = await Promise.all([
        ctx.db.from('recipe').select('id, name'),
        loadRecipeStockScores(ctx.db, ctx.householdId),
      ]);
      const ranked = ((recipesRes.data ?? []) as Array<{ id: string; name: string }>)
        .map((r) => ({ id: r.id, name: r.name, score: scores.get(r.id) ?? 0 }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, limit);
      const enriched = await Promise.all(
        ranked.map(async (r) => {
          const cov = await getRecipeIngredientCoverage(ctx.db, ctx.householdId, r.id);
          return {
            recette: r.name,
            realisable_pct: Math.round(r.score * 100),
            manquants: cov.filter((c) => c.status === 'none').map((c) => c.name),
            insuffisants: cov.filter((c) => c.status === 'partial').map((c) => c.name),
          };
        }),
      );
      return JSON.stringify(enriched);
    }
    case 'get_recipe': {
      const rec = await findRecipe(ctx.db, String(args.recipeName ?? ''));
      if (!rec) return JSON.stringify({ trouvé: false });
      const cov = await getRecipeIngredientCoverage(ctx.db, ctx.householdId, rec.id);
      return JSON.stringify({
        trouvé: true,
        nom: rec.name,
        ingredients: cov.map((c) => ({
          nom: c.name,
          requis: c.requiredQty,
          unite: c.requiredUnit,
          statut: c.status === 'ok' ? 'en stock' : c.status === 'partial' ? 'insuffisant' : 'absent',
          en_stock: c.inStockQty,
        })),
      });
    }
    case 'list_recipe_groups': {
      const [groups, assignments] = await Promise.all([
        listRecipeGroups(ctx.db, ctx.householdId),
        loadRecipeGroupAssignments(ctx.db, ctx.householdId),
      ]);
      const counts = new Map<string, number>();
      for (const v of assignments.values()) if (v.groupId) counts.set(v.groupId, (counts.get(v.groupId) ?? 0) + 1);
      return JSON.stringify(groups.map((g) => ({ nom: g.name, recettes: counts.get(g.id) ?? 0 })));
    }
    case 'get_planning': {
      const ws = typeof args.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.weekStart) ? args.weekStart : undefined;
      const monday = mondayOf(ws);
      const from = isoDate(monday);
      const to = isoDate(addDays(monday, 6));
      const [mealsRes, offRes] = await Promise.all([
        ctx.db
          .from('planned_meal')
          .select('id, meal_date, slot, recipe_id, free_text, servings, produces_leftover, leftover_source_meal_id')
          .eq('household_id', ctx.householdId)
          .gte('meal_date', from)
          .lte('meal_date', to)
          .order('meal_date', { ascending: true }),
        ctx.db.from('day_off_plan').select('off_date').eq('household_id', ctx.householdId).eq('scope', 'household').gte('off_date', from).lte('off_date', to),
      ]);
      const rows = (mealsRes.data ?? []) as Array<{ id: string; meal_date: string; slot: string; recipe_id: string | null; free_text: string | null; servings: number | null; produces_leftover: boolean; leftover_source_meal_id: string | null }>;
      const recipeIds = [...new Set(rows.map((r) => r.recipe_id).filter((x): x is string => !!x))];
      const names = new Map<string, string>();
      if (recipeIds.length) {
        const { data } = await ctx.db.from('recipe').select('id, name').in('id', recipeIds);
        for (const r of (data ?? []) as Array<{ id: string; name: string }>) names.set(r.id, r.name);
      }
      return JSON.stringify({
        semaine: `${from} → ${to}`,
        repas: rows.map((r) => ({
          id: r.id,
          date: r.meal_date,
          creneau: SLOT_LABEL_FR[r.slot] ?? r.slot,
          slot: r.slot,
          nom: r.recipe_id ? names.get(r.recipe_id) ?? 'Recette' : r.free_text ?? (r.leftover_source_meal_id ? 'Reste' : 'Repas libre'),
          portions: r.servings,
          produit_reste: !!r.produces_leftover,
          est_reste: !!r.leftover_source_meal_id,
        })),
        jours_hors_plan: ((offRes.data ?? []) as Array<{ off_date: string }>).map((o) => o.off_date),
      });
    }
    default:
      return JSON.stringify({ erreur: 'outil de lecture inconnu' });
  }
}

/* ----------------------- Résumés des actions (pour la carte) ---------------- */

function summarize(name: WriteName, a: Record<string, unknown>): string {
  switch (name) {
    case 'add_items': {
      const items = (a.items as Array<{ label: string; quantity?: number; unit?: string }>) ?? [];
      if (items.length === 1) {
        const it = items[0];
        const qty = it.quantity != null ? ` (${it.quantity}${it.unit ? ` ${it.unit}` : ''})` : '';
        return `Ajouter « ${it.label}${qty} » à la liste`;
      }
      return `Ajouter ${items.length} articles à la liste : ${items.map((i) => i.label).join(', ')}`;
    }
    case 'remove_lines':
      return `Retirer ${(a.keys as string[]).length} article(s) de la liste`;
    case 'update_item':
      return `Modifier la quantité d’un article (${a.quantity ?? '—'} ${a.unit ?? ''})`.trim();
    case 'create_rayon':
      return `Créer le rayon « ${a.label} »`;
    case 'set_food_category':
      return `Ranger « ${a.label} » dans un rayon`;
    case 'reorder_rayons':
      return `Réordonner les rayons (parcours du magasin)`;
    case 'promote_essential':
      return `Marquer « ${a.label} » comme essentiel`;
    case 'remove_essential':
      return `Retirer un essentiel`;
    case 'reconduct_trip':
      return a.itemIds ? `Reconduire ${(a.itemIds as string[]).length} article(s) d’une liste passée` : `Reconduire une liste passée entière`;
    case 'add_recipe_missing':
      return `Ajouter les ingrédients manquants de « ${a.recipeName} »`;
    case 'checkout':
      return `Valider les courses (ranger les articles cochés au stock + archiver)`;
    case 'add_meal': {
      const what = a.recipeName ? `« ${a.recipeName} »` : a.description ? `« ${a.description} »` : 'un repas';
      const port = a.servings ? ` (${a.servings} portions)` : '';
      return `Planifier ${what}${port} le ${a.date} (${SLOT_LABEL_FR[String(a.slot)] ?? a.slot})`;
    }
    case 'move_meal':
      return `Déplacer un repas vers le ${a.date} (${SLOT_LABEL_FR[String(a.slot)] ?? a.slot})`;
    case 'remove_meal':
      return `Retirer un repas du planning`;
    case 'mark_day_off':
      return `Marquer le ${a.date} hors-plan`;
    case 'unmark_day_off':
      return `Réactiver le suivi du ${a.date}`;
    case 'set_meal_deviation':
      return a.status === 'skipped' ? `Marquer un repas « sauté »` : `Marquer un repas « différent »${a.ate ? ` (${a.ate})` : ''}`;
    case 'clear_meal_deviation':
      return `Annuler l’écart d’un repas (comme prévu)`;
    case 'reassign_leftover':
      return `Replanifier un reste le ${a.date} (${SLOT_LABEL_FR[String(a.slot)] ?? a.slot})${a.name ? ` : « ${a.name} »` : ''}`;
    case 'set_meal_leftover':
      return a.produces ? `Marquer un repas comme produisant un reste` : `Retirer le reste d’un repas`;
    case 'copy_week':
      return `Copier les repas de la semaine du ${a.fromWeekStart} vers celle du ${a.toWeekStart}`;
    case 'add_stock_item': {
      const qty = a.quantity != null ? ` ${a.quantity}${a.unit ? ` ${a.unit}` : ''}` : '';
      return `Ajouter « ${a.label}${qty} » au stock${a.location ? ` (${a.location})` : ''}`;
    }
    case 'remove_stock_item':
      return `Retirer un article du stock (sans gaspillage)`;
    case 'discard_stock_item':
      return `Jeter un article du stock (gaspillage)`;
    case 'set_stock_location':
      return `Ranger un article du stock dans un lieu`;
    case 'mark_stock_opened':
      return a.opened ? `Marquer un article du stock entamé` : `Marquer un article du stock non entamé`;
    case 'decrement_stock':
      return `Consommer ${a.amount} d’un article du stock`;
    case 'estimate_conservation':
      return `Estimer la conservation des articles du stock`;
    case 'create_recipe_group':
      return `Créer le groupe de recettes « ${a.name} »`;
    case 'rename_recipe_group':
      return `Renommer le groupe « ${a.name} » en « ${a.newName} »`;
    case 'delete_recipe_group':
      return `Supprimer le groupe « ${a.name} » (les recettes restent, sans groupe)`;
    case 'assign_recipe_to_group':
      return a.groupName ? `Ranger « ${a.recipeName} » dans « ${a.groupName} »` : `Retirer « ${a.recipeName} » de son groupe`;
    case 'update_recipe':
      return `Modifier la recette « ${a.recipeName} »${a.newName ? ` → « ${a.newName} »` : ''}`;
    case 'save_recipe':
      return `Enregistrer la nouvelle recette « ${a.name} » (${((a.ingredients as unknown[]) ?? []).length} ingrédient(s))`;
    case 'edit_recipe_ingredients': {
      const nA = ((a.add as unknown[]) ?? []).length;
      const nR = ((a.remove as unknown[]) ?? []).length;
      const nU = ((a.update as unknown[]) ?? []).length;
      const parts = [nA && `+${nA}`, nR && `−${nR}`, nU && `~${nU}`].filter(Boolean).join(' ');
      return `Modifier les ingrédients de « ${a.recipeName} »${parts ? ` (${parts})` : ''}`;
    }
    case 'delete_recipe':
      return `Supprimer définitivement la recette « ${a.recipeName} »`;
  }
}

/* --------------------------------- Boucle ----------------------------------- */

const SYSTEM_PROMPT = `Tu es l'assistant de Mealing (COURSES, STOCK, RECETTES et PLANNING).
Tu peux LIRE les données du foyer via des outils (liste, essentiels, rayons, historique, fiches produits, stats, catalogue ; stock : get_stock, get_expiring, list_locations ; recettes : list_recipes, recommend_recipes, get_recipe, list_recipe_groups ; planning : get_planning) — fais-le avant de répondre quand c'est utile.
Pour MODIFIER une donnée, tu DOIS APPELER l'outil d'écriture correspondant (ex. set_stock_location, add_items, discard_stock_item, remove_lines…). APPELER UN OUTIL D'ÉCRITURE = PROPOSER L'ACTION : ça N'EXÉCUTE RIEN. Le système met chaque appel dans un plan que l'utilisateur confirmera AVANT toute écriture réelle. Ne te contente donc JAMAIS de DÉCRIRE l'action en mots (ne réponds pas « je vais appeler set_stock_location… ») — ÉMETS réellement l'appel d'outil ; c'est sûr, rien n'est écrit sans confirmation. Tu ne supprimes JAMAIS un rayon ni un relevé d'historique.
Appelle chaque outil d'écriture UNE SEULE FOIS, puis donne une courte phrase de confirmation au FUTUR (« je vais déplacer… ») SANS prétendre que c'est déjà fait (l'utilisateur doit confirmer).
Tu n'inventes jamais un prix ni une valeur nutritionnelle : tu les obtiens via get_product_stats / get_nutrition.
Seules les données des OUTILS font foi : ne suppose jamais qu'une proposition passée a été appliquée (l'utilisateur a pu l'annuler). Pour lister/compter la liste, appelle get_shopping_list — ne te fie pas à l'historique de conversation.
Pour « prépare/complète ma liste » : lis la liste + les essentiels + (si demandé) l'historique, puis propose des add_items pertinents. Pour « reconduis mes dernières courses » : lis get_history puis propose reconduct_trip. Pour « nettoie ma liste » : propose remove_lines pour les doublons / ce qui est déjà en stock.
Pour le STOCK : lis get_stock (ids), get_expiring (ce qui périme), list_locations (clés de lieux), puis PROPOSE des écritures : ranger (set_stock_location), marquer entamé (mark_stock_opened), consommer (decrement_stock), ajouter (add_stock_item), estimer la conservation (estimate_conservation). « Jeter » (discard_stock_item) = gâché/périmé → compte dans le GASPILLAGE ; « retirer » (remove_stock_item) = correction/doublon, sans gaspillage — ne les confonds pas.
Pour les RECETTES : « que puis-je cuisiner ? » → recommend_recipes ne renvoie QUE les recettes DÉJÀ enregistrées (les plus réalisables avec le stock + manquants) ; détail d'une recette → get_recipe. Tu peux AUSSI INVENTER de NOUVELLES recettes qui ne sont pas dans la bibliothèque : lis get_stock, puis propose 1 à 3 idées réalistes en PRIVILÉGIANT les ingrédients disponibles (indique pour chacune les ingrédients à acheter en plus). Si l'utilisateur veut en garder une, utilise save_recipe pour l'enregistrer (nom + ingrédients + étapes ; la nutrition est calculée depuis le catalogue, jamais inventée par toi). Tu peux aussi : créer/renommer/supprimer un groupe (create_recipe_group / rename_recipe_group / delete_recipe_group), ranger une recette dans un groupe (assign_recipe_to_group), modifier les méta d'une recette (update_recipe : nom/portions/temps/description), et modifier ses INGRÉDIENTS (edit_recipe_ingredients : add/remove/update ciblés par nom — lis get_recipe avant pour connaître les ingrédients actuels). Désigne toujours recettes et groupes par leur NOM. Tu peux SUPPRIMER une recette (delete_recipe) — action destructive, mais comme toute écriture elle est confirmée avant d'être appliquée ; ne le fais que si c'est clairement demandé.
Pour le PLANNING : lis get_planning (ids des repas + jours hors-plan ; weekStart optionnel pour une autre semaine), puis PROPOSE : planifier (add_meal : recette OU description, servings = portions, producesLeftover si batch), déplacer (move_meal), retirer (remove_meal), signaler un écart (set_meal_deviation : sauté / différent+ate) ou l'annuler (clear_meal_deviation), marquer/réactiver une journée hors-plan (mark_day_off / unmark_day_off), gérer les restes (set_meal_leftover puis reassign_leftover : « tel quel » sans name, ou plat improvisé avec name — aucun achat généré), dupliquer une semaine (copy_week). Pour « que planifier cette semaine ? » : croise recommend_recipes (réalisables avec le stock) avec get_planning (créneaux vides) et propose des add_meal. Toute écriture sur un repas précis (déplacer/retirer/écart/reste) exige son \`id\` EXACT renvoyé par get_planning — appelle-le d'abord ; n'invente jamais un id.
IMPORTANT : toute écriture visant un article précis du stock (jeter/retirer/ranger/consommer/marquer entamé) exige son \`id\` EXACT (un UUID) renvoyé par get_stock ou get_expiring. Appelle TOUJOURS get_stock juste avant pour récupérer cet id ; n'invente JAMAIS un id et n'utilise pas le nom de l'article comme id.
N'ÉCRIS JAMAIS l'id (UUID) dans tes réponses à l'utilisateur : il sert uniquement aux appels d'outils, en interne. Dans le chat, désigne toujours les articles par leur NOM (« le saumon »), jamais par leur UUID — c'est plus naturel.
Réponds en français, de façon concise. Si une action te manque d'info, demande-la plutôt que d'inventer.
Date du jour : ${isoDate(new Date())}.`;

/** Produit une réponse OU un plan d'actions à confirmer. N'écrit rien. */
export async function runAgent(
  db: DB,
  params: { householdId: string; profileId: string; conversationId: string; message: string },
): Promise<AgentResult> {
  const provider = getAIProvider();
  if (!provider.chatWithTools) return { type: 'reply', message: "L'agent à outils n'est pas disponible." };
  const ctx: Ctx = { db, householdId: params.householdId };

  // Historique SCOPÉ à la conversation courante (#3) : l'agent ne mélange plus toutes les
  // conversations du profil. Borné par la limite de messages de la conversation (#4).
  const { data: history } = await db
    .from('conversation_ia')
    .select('role, content')
    .eq('conversation_id', params.conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(60);

  const messages: ToolChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...((history ?? []) as Array<{ role: string; content: string }>).map(
      (h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content }) as ToolChatMessage,
    ),
    { role: 'user', content: params.message },
  ];

  const tools = [...READ_TOOLS, ...WRITE_TOOLS];
  const plan: ProposedAction[] = [];

  for (let step = 0; step < 6; step++) {
    let res;
    try {
      res = await provider.chatWithTools(messages, tools, { temperature: 0.2 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      // Quota gratuit Groq (tokens/minute) atteint → message clair, pas de crash.
      if (msg.includes('429') || /rate limit/i.test(msg)) {
        return { type: 'reply', message: "L'IA est momentanément saturée (quota gratuit par minute). Réessaie dans ~15 secondes." };
      }
      return { type: 'reply', message: "Une erreur est survenue côté IA, réessaie." };
    }
    if (res.toolCalls.length === 0) {
      const message = res.content?.trim() || (plan.length ? 'Voici ce que je propose :' : '…');
      return plan.length > 0 ? { type: 'plan', message, actions: plan } : { type: 'reply', message };
    }

    messages.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });

    for (const call of res.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        /* args invalides → objet vide */
      }
      if (WRITE_NAMES.includes(call.name as WriteName)) {
        const schema = WRITE_SCHEMAS[call.name as WriteName];
        const parsed = schema.safeParse(args);
        if (!parsed.success) {
          messages.push({ role: 'tool', toolCallId: call.id, content: 'Paramètres invalides pour cette action.' });
          continue;
        }
        const wname = call.name as WriteName;
        const entry: ProposedAction = { name: wname, args: parsed.data as Record<string, unknown>, summary: summarize(wname, parsed.data as Record<string, unknown>) };
        if (SINGLETON_WRITES.has(wname)) {
          // Une seule occurrence sensée (réordonnancement, checkout) → on remplace.
          const idx = plan.findIndex((p) => p.name === wname);
          if (idx >= 0) plan[idx] = entry;
          else plan.push(entry);
        } else {
          const argsJson = JSON.stringify(parsed.data);
          const dup = plan.some((p) => p.name === wname && JSON.stringify(p.args) === argsJson);
          if (!dup) plan.push(entry);
        }
        messages.push({ role: 'tool', toolCallId: call.id, content: 'OK, action ajoutée au plan à confirmer. Ne la propose pas à nouveau ; réponds simplement à l’utilisateur.' });
      } else {
        // Une lecture qui échoue ne doit PAS faire planter tout le tour : on renvoie
        // l'erreur comme résultat d'outil (l'agent peut réagir) et on la logge.
        let out: string;
        try {
          out = await runReadTool(ctx, call.name, args);
        } catch (e) {
          console.error(`[agent] outil de lecture ${call.name} a échoué :`, e);
          out = `Erreur interne lors de la lecture (${call.name}).`;
        }
        messages.push({ role: 'tool', toolCallId: call.id, content: out.slice(0, 6000) });
      }
    }
  }

  // Garde-fou : trop d'étapes → on renvoie ce qu'on a.
  return plan.length > 0
    ? { type: 'plan', message: 'Voici ce que je propose :', actions: plan }
    : { type: 'reply', message: "Je n'ai pas réussi à aboutir, peux-tu reformuler ?" };
}

/* ------------------------------- Exécution ---------------------------------- */

/** Trouve une ligne de la liste actuelle par sa clé canonique. */
function findLine(lines: ShoppingLine[], key: string): ShoppingLine | undefined {
  return lines.find((l) => l.key === key);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STOCK_ROW = "Article introuvable dans le stock — utilise get_stock pour vérifier le nom/l'id exact.";
const AMBIGUOUS_STOCK = "Plusieurs articles du stock correspondent — précise lequel (via get_stock).";

interface StockTarget {
  id: string;
  food_id: string | null;
  label: string | null;
  quantity: number | null;
  unit: string | null;
}

const normName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

/**
 * Résout l'article de stock visé par une écriture. ROBUSTE au comportement réel du modèle
 * qui, malgré la consigne, passe souvent le NOM au lieu de l'`id` : on tente d'abord l'id
 * (UUID) puis on RETOMBE sur une résolution par libellé / nom d'aliment (dans les deux sens
 * d'inclusion — il passe parfois « le yaourt X »). Renvoie l'article, null (aucun) ou
 * 'ambiguous' (plusieurs correspondances → demander de préciser). Jamais d'exception sur un
 * id non-UUID (sinon l'exécution du plan planterait).
 */
async function resolveStockTarget(
  db: DB,
  householdId: string,
  idOrName: string,
): Promise<StockTarget | null | 'ambiguous'> {
  const v = idOrName.trim();
  if (UUID_RE.test(v)) {
    const { data } = await db
      .from('stock')
      .select('id, food_id, label, quantity, unit')
      .eq('household_id', householdId)
      .eq('id', v)
      .maybeSingle();
    if (data) return data as StockTarget;
  }
  const target = normName(v);
  if (!target) return null;
  const { data: rows } = await db
    .from('stock')
    .select('id, food_id, label, quantity, unit, food:food_id(name)')
    .eq('household_id', householdId);
  const matches = ((rows ?? []) as Array<StockTarget & { food: { name: string } | { name: string }[] | null }>).filter((r) => {
    const f = Array.isArray(r.food) ? r.food[0] : r.food;
    const name = normName(f?.name ?? r.label ?? '');
    const lbl = normName(r.label ?? '');
    if (!name && !lbl) return false;
    if (name === target || lbl === target) return true;
    const hit = (s: string) => s.length >= 3 && (s.includes(target) || target.includes(s));
    return hit(name) || hit(lbl);
  });
  if (matches.length === 1) {
    const m = matches[0];
    return { id: m.id, food_id: m.food_id, label: m.label, quantity: m.quantity, unit: m.unit };
  }
  return matches.length > 1 ? 'ambiguous' : null;
}

const NO_MEAL_ROW = "Repas introuvable — utilise get_planning pour récupérer l'id exact du repas.";

/** Charge un repas planifié du foyer par id (UUID + scope foyer). Null si introuvable/invalide. */
async function getMeal(
  db: DB,
  householdId: string,
  id: string,
): Promise<{ id: string; recipe_id: string | null; free_text: string | null; produces_leftover: boolean } | null> {
  if (!UUID_RE.test(id.trim())) return null;
  const { data } = await db
    .from('planned_meal')
    .select('id, recipe_id, free_text, produces_leftover')
    .eq('id', id)
    .eq('household_id', householdId)
    .maybeSingle();
  return (data as { id: string; recipe_id: string | null; free_text: string | null; produces_leftover: boolean } | null) ?? null;
}

/** Exécute UNE action d'écriture (après confirmation). Renvoie un libellé de résultat. */
async function executeOne(ctx: Ctx, action: ProposedAction): Promise<string> {
  const { db, householdId } = ctx;
  const a = action.args;
  switch (action.name) {
    case 'add_items': {
      const items = (a.items as Array<{ label: string; quantity?: number; unit?: string }>);
      const rows = await Promise.all(
        items.map(async (it) => ({
          household_id: householdId,
          label: it.label.trim(),
          food_id: await findCatalogFoodIdByLabel(db, it.label),
          quantity: it.quantity ?? null,
          unit: it.unit ?? null,
        })),
      );
      const { error } = await db.from('shopping_manual_item').insert(rows);
      if (error) throw new Error(error.message);
      return `${rows.length} article(s) ajouté(s) à la liste.`;
    }
    case 'remove_lines': {
      const lines = await currentLines(ctx);
      const keys = a.keys as string[];
      const manualIds: string[] = [];
      const dismissKeys: string[] = [];
      for (const k of keys) {
        const line = findLine(lines, k);
        if (!line) continue;
        if (line.manualOnly && line.manualIds?.length) manualIds.push(...line.manualIds);
        else dismissKeys.push(k);
      }
      if (manualIds.length) await db.from('shopping_manual_item').delete().in('id', manualIds);
      if (dismissKeys.length) await dismissShoppingItems(db, householdId, dismissKeys);
      return `${keys.length} article(s) retiré(s).`;
    }
    case 'update_item': {
      const lines = await currentLines(ctx);
      const line = findLine(lines, String(a.key));
      if (!line?.manualOnly || !line.manualId) return 'Cet article ne peut pas être édité (non manuel).';
      const patch: Record<string, unknown> = {};
      if (a.quantity !== undefined) patch.quantity = a.quantity;
      if (a.unit !== undefined) patch.unit = a.unit || null;
      await db.from('shopping_manual_item').update(patch).eq('id', line.manualId);
      return 'Quantité mise à jour.';
    }
    case 'create_rayon': {
      await createHouseholdCategory(db, householdId, { label: String(a.label), iconSlug: a.iconSlug as string | undefined, tint: a.tint as string | undefined });
      return `Rayon « ${a.label} » créé.`;
    }
    case 'set_food_category': {
      await setFoodPref(db, householdId, { label: String(a.label), categoryKey: String(a.categoryKey) });
      return `« ${a.label} » rangé.`;
    }
    case 'reorder_rayons': {
      await saveRayonOrder(db, householdId, a.orderedKeys as string[]);
      return 'Ordre des rayons mis à jour.';
    }
    case 'promote_essential': {
      const foodId = await findCatalogFoodIdByLabel(db, String(a.label));
      const { error } = await db.from('shopping_recurring_item').insert({
        household_id: householdId,
        food_id: foodId,
        label: String(a.label),
        default_quantity: (a.quantity as number | undefined) ?? null,
        unit: (a.unit as string | undefined) ?? null,
      });
      if (error) throw new Error(error.message);
      return `« ${a.label} » ajouté aux essentiels.`;
    }
    case 'remove_essential': {
      await db.from('shopping_recurring_item').delete().eq('id', String(a.id)).eq('household_id', householdId);
      return 'Essentiel retiré.';
    }
    case 'reconduct_trip': {
      let itemIds = a.itemIds as string[] | undefined;
      if (!itemIds || itemIds.length === 0) {
        const rows = (await db.from('shopping_trip_item').select('id').eq('trip_id', String(a.tripId))).data ?? [];
        itemIds = rows.map((r: { id: string }) => r.id);
      }
      const n = await reconductTripItems(db, householdId, itemIds);
      return `${n} article(s) reconduit(s) dans la liste.`;
    }
    case 'add_recipe_missing': {
      const { data: recipe } = await db.from('recipe').select('id').ilike('name', `%${a.recipeName}%`).limit(1).maybeSingle();
      if (!recipe?.id) return `Recette « ${a.recipeName} » introuvable.`;
      const missing = await recipeMissingIngredients(db, householdId, recipe.id);
      if (missing.length === 0) return 'Rien à ajouter : tout est déjà couvert par le stock.';
      const rows = await Promise.all(
        missing.map(async (m) => ({ household_id: householdId, label: m.label, food_id: m.foodId ?? (await findCatalogFoodIdByLabel(db, m.label)), quantity: m.quantity ?? null, unit: m.unit ?? null })),
      );
      const { error } = await db.from('shopping_manual_item').insert(rows);
      if (error) throw new Error(error.message);
      return `${rows.length} ingrédient(s) manquant(s) ajouté(s).`;
    }
    case 'checkout': {
      const { from, to } = await getShoppingWindow(db, householdId);
      const { added } = await checkoutPurchasedToStock(db, { householdId, from, to });
      return added > 0 ? `${added} article(s) rangé(s) au stock + relevé archivé.` : 'Aucun article coché à ranger.';
    }
    case 'add_meal': {
      let recipeId: string | undefined;
      if (a.recipeName) {
        const { data } = await db.from('recipe').select('id').ilike('name', `%${a.recipeName}%`).limit(1).maybeSingle();
        recipeId = data?.id;
      }
      await addPlannedMeal(db, {
        householdId,
        date: String(a.date),
        slot: a.slot as MealSlot,
        recipeId,
        freeText: recipeId ? undefined : (a.description as string | undefined) ?? (a.recipeName as string | undefined),
        servings: recipeId ? (a.servings as number | undefined) : undefined,
        producesLeftover: (a.producesLeftover as boolean | undefined) ?? false,
      });
      return `Repas planifié le ${a.date}.`;
    }
    case 'move_meal': {
      const m = await getMeal(db, householdId, String(a.mealId));
      if (!m) return NO_MEAL_ROW;
      await db.from('planned_meal').update({ meal_date: String(a.date), slot: a.slot as MealSlot, updated_at: new Date().toISOString() }).eq('id', m.id);
      return `Repas déplacé au ${a.date} (${SLOT_LABEL_FR[String(a.slot)] ?? a.slot}).`;
    }
    case 'remove_meal': {
      const m = await getMeal(db, householdId, String(a.mealId));
      if (!m) return NO_MEAL_ROW;
      await db.from('planned_meal').delete().eq('id', m.id);
      return `Repas retiré du planning.`;
    }
    case 'mark_day_off': {
      await markDayOffPlan(db, { householdId, date: String(a.date), scope: 'household' });
      return `Journée du ${a.date} marquée hors-plan.`;
    }
    case 'unmark_day_off': {
      await db.from('day_off_plan').delete().eq('household_id', householdId).eq('off_date', String(a.date)).eq('scope', 'household');
      return `Suivi réactivé pour le ${a.date}.`;
    }
    case 'set_meal_deviation': {
      const m = await getMeal(db, householdId, String(a.mealId));
      if (!m) return NO_MEAL_ROW;
      if (!ctx.profileId) return 'Profil manquant pour enregistrer l’écart.';
      await db.from('real_consumption').delete().eq('planned_meal_id', m.id);
      await recordConsumption(db, { profileId: ctx.profileId, plannedMealId: m.id, status: a.status as 'skipped' | 'different', actualFreeText: (a.ate as string | undefined) || undefined });
      return a.status === 'skipped' ? `Repas marqué « sauté ».` : `Repas marqué « différent »${a.ate ? ` (${a.ate})` : ''}.`;
    }
    case 'clear_meal_deviation': {
      const m = await getMeal(db, householdId, String(a.mealId));
      if (!m) return NO_MEAL_ROW;
      await db.from('real_consumption').delete().eq('planned_meal_id', m.id);
      return `Écart annulé (repas comme prévu).`;
    }
    case 'reassign_leftover': {
      const m = await getMeal(db, householdId, String(a.mealId));
      if (!m) return NO_MEAL_ROW;
      await reassignLeftover(db, { sourceMealId: m.id, date: String(a.date), slot: a.slot as MealSlot, householdId, name: a.name as string | undefined });
      return `Reste replanifié le ${a.date} (${SLOT_LABEL_FR[String(a.slot)] ?? a.slot}).`;
    }
    case 'set_meal_leftover': {
      const m = await getMeal(db, householdId, String(a.mealId));
      if (!m) return NO_MEAL_ROW;
      await setMealLeftover(db, m.id, Boolean(a.produces));
      return a.produces ? `Repas marqué comme produisant un reste.` : `Reste retiré du repas.`;
    }
    case 'copy_week': {
      const n = await copyPlannedWeek(db, { householdId, fromWeekStart: String(a.fromWeekStart), toWeekStart: String(a.toWeekStart) });
      return n > 0 ? `${n} repas copié(s) vers la semaine du ${a.toWeekStart}.` : `Rien à copier dans la semaine source.`;
    }
    case 'add_stock_item': {
      // Rattachement au catalogue (comme addStockAction) → fiche produit + conservation
      // intelligente possibles. Sans ça, l'article reste en food_id null (non estimable).
      const label = String(a.label);
      const foodId =
        (await findCatalogFoodIdByLabel(db, label)) ??
        (await getOrCreateCatalogFood(db, { label, name: label, category: null })) ??
        undefined;
      const location = a.location ? String(a.location) : undefined;
      const quantity = a.quantity as number | undefined;
      const unit = a.unit as string | undefined;
      const trackingMode: 'quantity' | 'presence' = quantity != null ? 'quantity' : 'presence';
      const stockId = await upsertStockItem(db, { householdId, foodId, label, trackingMode, quantity, unit, present: true });
      if (location) await setStockLocation(db, stockId, location);
      await recordStockEvent(db, { householdId, stockId, foodId: foodId ?? null, label, kind: 'in', quantity: quantity ?? null, unit: unit ?? null, source: 'manual' });
      return `« ${label} » ajouté au stock.`;
    }
    case 'remove_stock_item': {
      const t = await resolveStockTarget(db, householdId, String(a.id));
      if (t === 'ambiguous') return AMBIGUOUS_STOCK;
      if (!t) return NO_STOCK_ROW;
      await removeStockItems(db, [t.id]);
      return `« ${t.label ?? 'Article'} » retiré du stock (sans gaspillage).`;
    }
    case 'discard_stock_item': {
      // Miroir de discardStockAction : journalise un REBUT (gaspillage) PUIS retire.
      const t = await resolveStockTarget(db, householdId, String(a.id));
      if (t === 'ambiguous') return AMBIGUOUS_STOCK;
      if (!t) return NO_STOCK_ROW;
      await recordStockEvent(db, { householdId, stockId: t.id, foodId: t.food_id, label: t.label, kind: 'discard', quantity: t.quantity, unit: t.unit, source: 'expiry' });
      await removeStockItems(db, [t.id]);
      return `« ${t.label ?? 'Article'} » jeté (compté comme gaspillage).`;
    }
    case 'set_stock_location': {
      const t = await resolveStockTarget(db, householdId, String(a.id));
      if (t === 'ambiguous') return AMBIGUOUS_STOCK;
      if (!t) return NO_STOCK_ROW;
      await setStockLocation(db, t.id, String(a.location));
      return `« ${t.label ?? 'Article'} » rangé dans le lieu choisi.`;
    }
    case 'mark_stock_opened': {
      const t = await resolveStockTarget(db, householdId, String(a.id));
      if (t === 'ambiguous') return AMBIGUOUS_STOCK;
      if (!t) return NO_STOCK_ROW;
      await db.from('stock').update({ date_ouverture: a.opened ? new Date().toISOString() : null }).eq('id', t.id);
      return a.opened ? `« ${t.label ?? 'Article'} » marqué entamé.` : `« ${t.label ?? 'Article'} » marqué non entamé.`;
    }
    case 'decrement_stock': {
      const t = await resolveStockTarget(db, householdId, String(a.id));
      if (t === 'ambiguous') return AMBIGUOUS_STOCK;
      if (!t) return NO_STOCK_ROW;
      const amount = Number(a.amount);
      await decrementStock(db, { stockId: t.id, amount });
      await recordStockEvent(db, { householdId, stockId: t.id, foodId: t.food_id, label: t.label, kind: 'out', quantity: amount, unit: t.unit, source: 'consumption' });
      return `Quantité consommée (−${amount}) de « ${t.label ?? 'Article'} ».`;
    }
    case 'estimate_conservation': {
      const n = await ensureStockConservation(db, householdId);
      return `Conservation estimée pour ${n} article(s) du stock.`;
    }
    case 'create_recipe_group': {
      await createRecipeGroup(db, householdId, String(a.name));
      return `Groupe de recettes « ${a.name} » créé.`;
    }
    case 'rename_recipe_group': {
      const g = await findRecipeGroup(db, householdId, String(a.name));
      if (!g) return `Groupe « ${a.name} » introuvable.`;
      await renameRecipeGroup(db, householdId, g.id, String(a.newName));
      return `Groupe renommé en « ${a.newName} ».`;
    }
    case 'delete_recipe_group': {
      const g = await findRecipeGroup(db, householdId, String(a.name));
      if (!g) return `Groupe « ${a.name} » introuvable.`;
      await deleteRecipeGroup(db, householdId, g.id);
      return `Groupe « ${g.name} » supprimé (recettes conservées, sans groupe).`;
    }
    case 'assign_recipe_to_group': {
      const rec = await findRecipe(db, String(a.recipeName));
      if (!rec) return `Recette « ${a.recipeName} » introuvable.`;
      const groupName = a.groupName ? String(a.groupName) : '';
      let groupId: string | null = null;
      if (groupName) {
        const g = await findRecipeGroup(db, householdId, groupName);
        if (!g) return `Groupe « ${groupName} » introuvable (crée-le d’abord).`;
        groupId = g.id;
      }
      await bulkSetRecipeGroup(db, householdId, [rec.id], groupId);
      return groupId ? `« ${rec.name} » rangée dans « ${groupName} ».` : `« ${rec.name} » retirée de son groupe.`;
    }
    case 'update_recipe': {
      const rec = await findRecipe(db, String(a.recipeName));
      if (!rec) return `Recette « ${a.recipeName} » introuvable.`;
      await updateRecipeFields(db, rec.id, {
        name: a.newName as string | undefined,
        description: a.description as string | undefined,
        servings: a.servings as number | undefined,
        prepTimeMin: a.prepTimeMin as number | undefined,
        cookTimeMin: a.cookTimeMin as number | undefined,
      });
      return `Recette « ${rec.name} » mise à jour.`;
    }
    case 'save_recipe': {
      const ingredients = (a.ingredients as Array<{ name: string; quantity?: number; unit?: string }>) ?? [];
      await createRecipe(db, {
        name: String(a.name),
        description: a.description as string | undefined,
        instructions: ((a.steps as string[] | undefined) ?? []).join('\n') || undefined,
        prepTimeMin: a.prepTimeMin as number | undefined,
        cookTimeMin: a.cookTimeMin as number | undefined,
        servings: (a.servings as number | undefined) ?? 1,
        // Ingrédients en libellé → createRecipe les relie au catalogue (food_id) ;
        // aucune valeur nutritionnelle n'est fournie par l'IA (garde-fou n°3).
        ingredients: ingredients.map((i) => ({ freeText: i.name, quantity: i.quantity, unit: i.unit })),
        tags: (a.tags as string[] | undefined) ?? [],
      });
      return `Recette « ${a.name} » enregistrée (ingrédients reliés au catalogue).`;
    }
    case 'edit_recipe_ingredients': {
      const rec = await findRecipe(db, String(a.recipeName));
      if (!rec) return `Recette « ${a.recipeName} » introuvable.`;
      const { added, removed, updated } = await editRecipeIngredients(db, rec.id, {
        add: a.add as Array<{ name: string; quantity?: number; unit?: string }> | undefined,
        remove: a.remove as string[] | undefined,
        update: a.update as Array<{ name: string; quantity?: number; unit?: string; newName?: string }> | undefined,
      });
      return `Ingrédients de « ${rec.name} » mis à jour (${added} ajouté(s), ${removed} retiré(s), ${updated} modifié(s)).`;
    }
    case 'delete_recipe': {
      const rec = await findRecipe(db, String(a.recipeName));
      if (!rec) return `Recette « ${a.recipeName} » introuvable.`;
      await deleteRecipe(db, rec.id);
      return `Recette « ${rec.name} » supprimée.`;
    }
  }
}

/** Exécute un plan d'actions confirmé. À n'appeler qu'après confirmation explicite. */
export async function executeAgentPlan(
  db: DB,
  params: { householdId: string; profileId: string; actions: ProposedAction[] },
): Promise<string[]> {
  const ctx: Ctx = { db, householdId: params.householdId, profileId: params.profileId };
  const results: string[] = [];
  for (const action of params.actions) {
    // Re-valide chaque action (défense en profondeur : le plan vient du client).
    const schema = WRITE_SCHEMAS[action.name];
    const parsed = schema?.safeParse(action.args);
    if (!schema || !parsed?.success) {
      results.push('Action ignorée (invalide).');
      continue;
    }
    results.push(await executeOne(ctx, { ...action, args: parsed.data as Record<string, unknown> }));
  }
  return results;
}
