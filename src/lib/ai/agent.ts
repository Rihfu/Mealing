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
  reconductPlannedMeals,
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
  // nutrition (N3 — l'agent CONFIGURE les suivis, ne calcule jamais une valeur)
  listFacets,
  getProfileFacets,
  setProfileFacets,
  getNutritionProfile,
  getNutritionSettings,
  recommendTracking,
  getProfileHabits,
  listHabitTypes,
  addProfileHabit,
  addCustomHabit,
  removeProfileHabit,
  trackNutrient,
  untrackNutrient,
  addFoodExtra,
  // foyer (section Foyer — lecture + réglages/invitations confirmés)
  getHouseholdOverview,
  renameHousehold,
  setHouseholdSettings,
  inviteToHousehold,
  getNotificationPref,
  setNotificationPref,
  // nutrition (lecture riche — agrégats/habitudes/extras : valeurs LUES en base, jamais calculées par l'IA)
  aggregatePeriodNutrition,
  countHabitOccurrences,
  listExtras,
  removeExtra,
  suggestRecipesForNutrient,
  suggestRecipesForHabit,
  backfillRecipeIngredientLinks,
  completeMissingFoodNutrition,
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
  reconduct_meals: z
    .object({
      mealIds: z.array(z.string().min(1)).min(1),
      offsetDays: z.number().int().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .refine((v) => !!v.date || (v.offsetDays != null && v.offsetDays !== 0), {
      message: 'offsetDays ou date requis',
    }),
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
  // nutrition (N3) — l'agent configure, jamais il ne calcule une valeur (n°3).
  set_facets: z.object({ facets: z.array(z.string().min(1)) }),
  track_nutrient: z.object({ code: z.string().min(1), min: z.number().optional(), max: z.number().optional() }),
  untrack_nutrient: z.object({ code: z.string().min(1) }),
  add_habit: z.object({ habitKey: z.string().min(1) }),
  add_custom_habit: z.object({
    label: z.string().min(1),
    direction: z.enum(['min', 'max']),
    targetCount: z.number().int().positive(),
    period: z.enum(['day', 'week']),
    matchTags: z.array(z.enum(['poisson_gras', 'legumineuse', 'fruit', 'legume', 'noix_graine', 'source_collagene', 'fermente'])).min(1),
  }),
  remove_habit: z.object({ idOrLabel: z.string().min(1) }),
  log_extra: z.object({ label: z.string().min(1), quantity: z.number().positive() }),
  remove_extra: z.object({ idOrLabel: z.string().min(1) }),
  repair_nutrition_data: z.object({}),
  // foyer — l'agent ne retire JAMAIS un membre, ne transfère pas l'admin, ne quitte pas.
  rename_household: z.object({ name: z.string().min(1).max(80) }),
  invite_member: z.object({ email: z.string().email() }),
  cancel_invitation: z.object({ email: z.string().min(3) }),
  set_household_settings: z
    .object({
      shoppingHorizonDays: z.number().int().min(1).max(30).optional(),
      defaultServings: z.number().int().min(0).max(24).optional(),
      expiryThresholdDays: z.number().int().min(1).max(60).optional(),
    })
    .refine(
      (v) => v.shoppingHorizonDays !== undefined || v.defaultServings !== undefined || v.expiryThresholdDays !== undefined,
      { message: 'aucun réglage fourni' },
    ),
} as const;

type WriteName = keyof typeof WRITE_SCHEMAS;
const WRITE_NAMES = Object.keys(WRITE_SCHEMAS) as WriteName[];
// Actions « singleton » : une seule occurrence sensée par plan (on remplace si répétée).
const SINGLETON_WRITES = new Set<WriteName>(['reorder_rayons', 'checkout', 'estimate_conservation', 'repair_nutrition_data', 'rename_household', 'set_household_settings']);

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
  { name: 'get_planning', description: 'Repas planifiés d’une semaine avec leur `id` (pour agir : déplacer/retirer/reconduire/écart/reste). weekStart optionnel (YYYY-MM-DD, un jour de la semaine voulue, PASSÉE ou FUTURE) — défaut = semaine en cours. Renvoie aussi : portions, restes, repas individuels (avec le prénom), écarts déjà signalés (sauté/différent) et jours hors-plan.', parameters: obj({ weekStart: str('YYYY-MM-DD (optionnel)') }) },
  { name: 'get_past_meals', description: 'Historique des PLATS des 12 dernières semaines, dédupliqué (nom, nb de fois, dernier passage + créneau). Pour « qu’a-t-on mangé récemment ? » / retrouver un plat à replanifier.', parameters: obj({}) },
  { name: 'get_nutrition_summary', description: 'Bilan NUTRITION personnel de l’utilisateur : planifié vs réel par nutriment suivi (avec zone min/max et statut), sur un jour ou une semaine + couverture des données. period = "day"|"week" (défaut week), date optionnelle (YYYY-MM-DD, défaut aujourd’hui). Valeurs LUES en base — jamais calculées par toi.', parameters: obj({ period: { type: 'string', enum: ['day', 'week'] }, date: str('YYYY-MM-DD (optionnel)') }) },
  { name: 'get_habits_progress', description: 'Progression des HABITUDES suivies sur la semaine en cours (fait / à venir / cible, prochaine occurrence). Pour « où j’en suis sur le poisson gras ? ».', parameters: obj({}) },
  { name: 'get_extras', description: 'Extras HORS-PLAN notés par l’utilisateur (aliment, quantité, date) sur une période. from/to optionnels (YYYY-MM-DD, défaut aujourd’hui).', parameters: obj({ from: str('YYYY-MM-DD (optionnel)'), to: str('YYYY-MM-DD (optionnel)') }) },
  { name: 'suggest_recipe_ideas', description: 'Idées de recettes DU FOYER pour combler un manque : nutrientCode (ex. protein, fiber) → les plus riches par portion ; OU habitKey (ex. poisson_gras, legumineuse) → celles qui contiennent un aliment concerné. Réalisabilité stock annotée. Enchaîne avec add_meal si l’utilisateur veut planifier.', parameters: obj({ nutrientCode: str('code du nutriment (optionnel)'), habitKey: str('clé ou libellé d’habitude (optionnel)') }) },
  { name: 'get_tracking_plan', description: 'Plan de suivi NUTRITION personnel de l’utilisateur : facettes cochées, nutriments suivis (avec zones), habitudes suivies (avec id), habitudes disponibles au catalogue et recommandations non suivies (avec leur pourquoi). À lire AVANT de configurer un suivi.', parameters: obj({}) },
  { name: 'get_household', description: 'Le FOYER : nom, membres (prénom, admin, moi), invitations en attente (email + expiration) et réglages (cadence de courses, portions par défaut d’un repas, seuil d’alerte péremption). À lire avant toute action foyer.', parameters: obj({}) },
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
  { name: 'reconduct_meals', description: 'RECONDUIT (copie) des repas existants vers une autre date : offsetDays (lendemain = 1, semaine suivante = 7) OU date fixe (YYYY-MM-DD) — le créneau est conservé, les copies repartent propres (ni reste ni écart). mealIds = ids de get_planning.', parameters: obj({ mealIds: { type: 'array', items: str() }, offsetDays: num('décalage en jours (ex. 1, 7)'), date: str('YYYY-MM-DD (sinon offsetDays)') }, ['mealIds']) },
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
  { name: 'set_facets', description: 'Remplace les facettes du profil nutrition (clés de get_tracking_plan). Les recommandations se recalculent.', parameters: obj({ facets: { type: 'array', items: str() } }, ['facets']) },
  { name: 'track_nutrient', description: 'Suit un NUTRIMENT (code de get_tracking_plan, ex. protein/fiber/iron) avec une zone quotidienne optionnelle (min/max). N’invente JAMAIS une cible : propose celle des recommandations, ou celle donnée par l’utilisateur (médecin/coach).', parameters: obj({ code: str(), min: num(), max: num() }, ['code']) },
  { name: 'untrack_nutrient', description: 'Arrête de suivre un nutriment (code de get_tracking_plan).', parameters: obj({ code: str() }, ['code']) },
  { name: 'add_habit', description: 'Suit une HABITUDE du catalogue (habitKey de get_tracking_plan, ex. poisson_gras/legumineuse).', parameters: obj({ habitKey: str() }, ['habitKey']) },
  { name: 'add_custom_habit', description: 'Crée une habitude PERSONNALISÉE comptée depuis le planning : direction (min = au moins / max = au plus), N fois par jour/semaine, sur des groupes d’aliments (tags : poisson_gras, legumineuse, fruit, legume, noix_graine, source_collagene, fermente).', parameters: obj({ label: str(), direction: { type: 'string', enum: ['min', 'max'] }, targetCount: num(), period: { type: 'string', enum: ['day', 'week'] }, matchTags: { type: 'array', items: str() } }, ['label', 'direction', 'targetCount', 'period', 'matchTags']) },
  { name: 'remove_habit', description: 'Retire une habitude suivie (id OU libellé de get_tracking_plan).', parameters: obj({ idOrLabel: str() }, ['idOrLabel']) },
  { name: 'log_extra', description: 'Enregistre un EXTRA hors-plan mangé par l’utilisateur (aliment + quantité en g/ml) — compté dans son réel estimé. Pour « j’ai mangé un yaourt » / « j’ai grignoté 50 g de chips ».', parameters: obj({ label: str(), quantity: num('quantité en unité de base (g/ml)') }, ['label', 'quantity']) },
  { name: 'remove_extra', description: 'Retire un extra noté par erreur (id de get_extras, ou libellé de l’aliment — le plus récent des 7 derniers jours est retiré).', parameters: obj({ idOrLabel: str() }, ['idOrLabel']) },
  { name: 'repair_nutrition_data', description: 'Répare la chaîne de données nutrition : relie au catalogue les ingrédients de recettes en texte libre + complète les valeurs manquantes depuis USDA/OFF (jamais l’IA). À proposer si la couverture (get_nutrition_summary) est faible. Relançable.', parameters: obj({}) },
  { name: 'rename_household', description: 'Renomme le foyer (réservé à l’admin — la base refuse sinon).', parameters: obj({ name: str('nouveau nom') }, ['name']) },
  { name: 'invite_member', description: 'Invite quelqu’un dans le foyer par email (admin). Le lien d’invitation (valable 7 jours) apparaît sur la page Foyer.', parameters: obj({ email: str() }, ['email']) },
  { name: 'cancel_invitation', description: 'Annule une invitation en attente (admin), désignée par l’email invité (voir get_household).', parameters: obj({ email: str() }, ['email']) },
  { name: 'set_household_settings', description: 'Règle le foyer : shoppingHorizonDays (courses pour N jours, 1-30), defaultServings (portions par défaut d’un repas de foyer, 1-24 ; 0 = revenir aux portions de la recette), expiryThresholdDays (alerte péremption à ≤ N jours, 1-60). Fournis seulement les réglages à changer.', parameters: obj({ shoppingHorizonDays: num(), defaultServings: num(), expiryThresholdDays: num() }) },
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
          .select('id, meal_date, slot, recipe_id, free_text, servings, produces_leftover, leftover_source_meal_id, is_individual, individual_profile_id')
          .eq('household_id', ctx.householdId)
          .gte('meal_date', from)
          .lte('meal_date', to)
          .order('meal_date', { ascending: true }),
        ctx.db.from('day_off_plan').select('off_date').eq('household_id', ctx.householdId).eq('scope', 'household').gte('off_date', from).lte('off_date', to),
      ]);
      const rows = (mealsRes.data ?? []) as Array<{ id: string; meal_date: string; slot: string; recipe_id: string | null; free_text: string | null; servings: number | null; produces_leftover: boolean; leftover_source_meal_id: string | null; is_individual: boolean; individual_profile_id: string | null }>;
      const recipeIds = [...new Set(rows.map((r) => r.recipe_id).filter((x): x is string => !!x))];
      const profileIds = [...new Set(rows.map((r) => r.individual_profile_id).filter((x): x is string => !!x))];
      const mealIds = rows.map((r) => r.id);
      const names = new Map<string, string>();
      const profileNames = new Map<string, string>();
      // Écarts déjà signalés (sauté / mangé autre chose) — ceux visibles sous RLS.
      const deviationByMeal = new Map<string, { status: string; ate: string | null }>();
      await Promise.all([
        (async () => {
          if (!recipeIds.length) return;
          const { data } = await ctx.db.from('recipe').select('id, name').in('id', recipeIds);
          for (const r of (data ?? []) as Array<{ id: string; name: string }>) names.set(r.id, r.name);
        })(),
        (async () => {
          if (!profileIds.length) return;
          const { data } = await ctx.db.from('profile').select('id, display_name').in('id', profileIds);
          for (const p of (data ?? []) as Array<{ id: string; display_name: string | null }>) profileNames.set(p.id, p.display_name ?? 'un membre');
        })(),
        (async () => {
          if (!mealIds.length) return;
          const { data } = await ctx.db
            .from('real_consumption')
            .select('planned_meal_id, status, actual_free_text')
            .in('planned_meal_id', mealIds)
            .in('status', ['skipped', 'different']);
          for (const d of (data ?? []) as Array<{ planned_meal_id: string | null; status: string; actual_free_text: string | null }>) {
            if (d.planned_meal_id) deviationByMeal.set(d.planned_meal_id, { status: d.status, ate: d.actual_free_text });
          }
        })(),
      ]);
      return JSON.stringify({
        semaine: `${from} → ${to}`,
        repas: rows.map((r) => {
          const dev = deviationByMeal.get(r.id);
          return {
            id: r.id,
            date: r.meal_date,
            creneau: SLOT_LABEL_FR[r.slot] ?? r.slot,
            slot: r.slot,
            nom: r.recipe_id ? names.get(r.recipe_id) ?? 'Recette' : r.free_text ?? (r.leftover_source_meal_id ? 'Reste' : 'Repas libre'),
            portions: r.servings,
            produit_reste: !!r.produces_leftover,
            est_reste: !!r.leftover_source_meal_id,
            individuel: r.is_individual ? (r.individual_profile_id ? profileNames.get(r.individual_profile_id) ?? 'un membre' : true) : false,
            ecart: dev ? (dev.status === 'skipped' ? 'sauté' : `différent${dev.ate ? ` (${dev.ate})` : ''}`) : null,
          };
        }),
        jours_hors_plan: ((offRes.data ?? []) as Array<{ off_date: string }>).map((o) => o.off_date),
      });
    }
    case 'get_past_meals': {
      // Même logique que l'historique des plats du planning : 12 semaines passées,
      // dédupliqué par recette/libellé, dernier passage + compteur.
      const today = new Date();
      const { data } = await ctx.db
        .from('planned_meal')
        .select('meal_date, slot, recipe_id, free_text, leftover_source_meal_id, recipe:recipe_id(name)')
        .eq('household_id', ctx.householdId)
        .gte('meal_date', isoDate(addDays(today, -84)))
        .lt('meal_date', isoDate(today))
        .order('meal_date', { ascending: false })
        .limit(400);
      const past = (data ?? []) as Array<{ meal_date: string; slot: string; recipe_id: string | null; free_text: string | null; leftover_source_meal_id: string | null; recipe: { name: string } | { name: string }[] | null }>;
      const byDish = new Map<string, { nom: string; fois: number; dernier: string; creneau: string }>();
      for (const r of past) {
        const recipeName = Array.isArray(r.recipe) ? r.recipe[0]?.name : r.recipe?.name;
        const nom = (recipeName ?? r.free_text ?? '').trim();
        if (!nom) continue; // restes sans nom propre : rien d'actionnable
        const key = r.recipe_id ?? `txt:${nom.toLowerCase()}`;
        const existing = byDish.get(key);
        if (existing) existing.fois += 1; // lignes triées du plus récent au plus ancien
        else byDish.set(key, { nom, fois: 1, dernier: r.meal_date, creneau: SLOT_LABEL_FR[r.slot] ?? r.slot });
      }
      return JSON.stringify([...byDish.values()].slice(0, 60));
    }
    case 'get_nutrition_summary': {
      // Bilan PERSONNEL (RLS) — valeurs agrégées depuis la base, jamais calculées par l'IA (n°3).
      if (!ctx.profileId) return JSON.stringify({ erreur: 'profil inconnu' });
      const period = args.period === 'day' ? 'day' : 'week';
      const ref = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : isoDate(new Date());
      let from: string, to: string;
      if (period === 'day') {
        from = ref;
        to = ref;
      } else {
        const monday = mondayOf(ref);
        from = isoDate(monday);
        to = isoDate(addDays(monday, 6));
      }
      const [agg, settings, nutritionProfile, typesRes] = await Promise.all([
        aggregatePeriodNutrition(ctx.db, { householdId: ctx.householdId, profileId: ctx.profileId, from, to }),
        getNutritionSettings(ctx.db, ctx.profileId),
        getNutritionProfile(ctx.db, ctx.profileId),
        ctx.db.from('nutrient_type').select('code, name, unit, is_base'),
      ]);
      const childMode = nutritionProfile?.isChild ?? false;
      const types = (typesRes.data ?? []) as Array<{ code: string; name: string; unit: string; is_base: boolean }>;
      const trackedSet = new Set(settings.tracked);
      const goalByCode = new Map(settings.goals.map((g) => [g.code, g]));
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const nutriments = types
        // Suivis explicites, sinon les nutriments de base (même règle que la page Nutrition).
        .filter((t) => (trackedSet.size > 0 ? trackedSet.has(t.code) : t.is_base))
        // Mode ENFANT : l'énergie n'est JAMAIS exposée (éthique, non négociable).
        .filter((t) => !(childMode && t.code === 'energy_kcal'))
        .map((t) => {
          const g = goalByCode.get(t.code);
          const reel = agg.real[t.code] ?? 0;
          const statut =
            g == null || (g.min == null && g.max == null)
              ? null
              : g.max != null && reel > g.max
                ? 'au-dessus'
                : g.min != null && reel < g.min
                  ? 'en dessous'
                  : 'dans la zone';
          return {
            code: t.code,
            nom: t.name,
            unite: t.unit,
            planifie: r1(agg.planned[t.code] ?? 0),
            reel: r1(reel),
            zone_min: g?.min ?? null,
            zone_max: g?.max ?? null,
            statut,
          };
        });
      const cov = agg.coverage;
      return JSON.stringify({
        periode: period === 'day' ? from : `${from} → ${to}`,
        mode_enfant: childMode,
        nutriments,
        couverture: {
          pct:
            cov.ingredientsTotal > 0
              ? Math.round((cov.ingredientsWithData / cov.ingredientsTotal) * 100)
              : cov.mealsTotal > 0
                ? Math.round((cov.mealsCovered / cov.mealsTotal) * 100)
                : null,
          repas_couverts: `${cov.mealsCovered}/${cov.mealsTotal}`,
          ingredients_avec_donnees: `${cov.ingredientsWithData}/${cov.ingredientsTotal}`,
        },
      });
    }
    case 'get_habits_progress': {
      if (!ctx.profileId) return JSON.stringify({ erreur: 'profil inconnu' });
      const monday = mondayOf();
      const weekStart = isoDate(monday);
      const weekEnd = isoDate(addDays(monday, 6));
      const habits = (await getProfileHabits(ctx.db, ctx.profileId)).filter((h) => h.enabled);
      if (habits.length === 0) return JSON.stringify({ habitudes: [], note: 'Aucune habitude suivie — voir get_tracking_plan pour en proposer.' });
      const counts = await countHabitOccurrences(ctx.db, {
        householdId: ctx.householdId,
        profileId: ctx.profileId,
        weekStart,
        weekEnd,
        today: isoDate(new Date()),
        habits: habits.map((h) => ({ key: h.id, matchTags: h.matchTags, matchFoodIds: h.matchFoodIds, distinctMode: h.distinctMode })),
      });
      return JSON.stringify({
        semaine: `${weekStart} → ${weekEnd}`,
        habitudes: habits.map((h) => {
          const c = counts.get(h.id);
          const fait = h.period === 'day' ? (c?.todayDone ?? 0) : (c?.weekDone ?? 0);
          return {
            libelle: h.label,
            habitKey: h.habitKey,
            objectif: `${h.direction === 'min' ? 'au moins' : 'au plus'} ${h.targetCount}×/${h.period === 'week' ? 'semaine' : 'jour'}`,
            fait,
            a_venir: h.period === 'day' ? 0 : (c?.weekUpcoming ?? 0),
            prochaine: c?.nextLabel ?? null,
            atteint: h.direction === 'min' ? fait >= h.targetCount : fait <= h.targetCount,
          };
        }),
      });
    }
    case 'get_extras': {
      if (!ctx.profileId) return JSON.stringify({ erreur: 'profil inconnu' });
      const today = isoDate(new Date());
      const from = typeof args.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.from) ? args.from : today;
      const to = typeof args.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.to) ? args.to : from;
      const items = await listExtras(ctx.db, ctx.profileId, { from, to });
      return JSON.stringify(items.map((e) => ({ id: e.id, aliment: e.foodName, qte: e.quantity, unite: e.unit, date: e.date })));
    }
    case 'suggest_recipe_ideas': {
      const nutrientCode = typeof args.nutrientCode === 'string' ? args.nutrientCode.trim() : '';
      const habitKey = typeof args.habitKey === 'string' ? args.habitKey.trim() : '';
      if (nutrientCode) {
        const s = await suggestRecipesForNutrient(ctx.db, { householdId: ctx.householdId, nutrientCode, limit: 5 });
        return JSON.stringify(s.map((x) => ({ recette: x.name, apport_par_portion: x.amountPerServing, realisable_pct: x.stockPct })));
      }
      if (habitKey) {
        // Résolution : habitude suivie du profil (perso incluse) → catalogue → la clé comme tag brut.
        let matchTags: string[] = [habitKey];
        let matchFoodIds: string[] = [];
        const q = normName(habitKey);
        if (ctx.profileId) {
          const mine = (await getProfileHabits(ctx.db, ctx.profileId)).find(
            (h) => h.habitKey === habitKey || normName(h.label).includes(q) || q.includes(normName(h.label)),
          );
          if (mine) {
            matchTags = mine.matchTags.length ? mine.matchTags : matchTags;
            matchFoodIds = mine.matchFoodIds;
          }
        }
        if (matchTags.length === 1 && matchTags[0] === habitKey) {
          const cat = (await listHabitTypes(ctx.db)).find((h) => h.key === habitKey || normName(h.label).includes(q));
          if (cat?.match_tags.length) matchTags = cat.match_tags;
        }
        const s = await suggestRecipesForHabit(ctx.db, { householdId: ctx.householdId, matchTags, matchFoodIds, limit: 5 });
        return JSON.stringify(s.map((x) => ({ recette: x.name, aliments_concernes: x.matchedFoods, realisable_pct: x.stockPct })));
      }
      return JSON.stringify({ erreur: 'nutrientCode ou habitKey requis' });
    }
    case 'get_household': {
      const [ov, pref] = await Promise.all([
        getHouseholdOverview(ctx.db, ctx.householdId),
        getNotificationPref(ctx.db, ctx.householdId),
      ]);
      return JSON.stringify({
        nom: ov.name,
        je_suis_admin: ov.isAdmin,
        membres: ov.members.map((m) => ({
          nom: m.displayName,
          admin: m.isAdmin,
          moi: m.id === ctx.profileId,
          membre_depuis: m.joinedAt.slice(0, 10),
        })),
        invitations_en_attente: ov.invitations.map((i) => ({ email: i.email, expire_le: i.expiresAt.slice(0, 10) })),
        reglages: {
          courses_pour_jours: ov.shoppingHorizonDays,
          portions_par_defaut: ov.defaultServings ?? 'celles de la recette',
          alerte_peremption_jours: pref.expiryThresholdDays,
        },
      });
    }
    case 'get_tracking_plan': {
      // Plan de suivi PERSONNEL (RLS) — l'agent lit, propose, ne calcule rien (n°3).
      if (!ctx.profileId) return JSON.stringify({ erreur: 'profil inconnu' });
      const pid = ctx.profileId;
      const [facetDefs, selected, nutritionProfile, settings, habits, habitTypes, typesRes] = await Promise.all([
        listFacets(ctx.db),
        getProfileFacets(ctx.db, pid),
        getNutritionProfile(ctx.db, pid),
        getNutritionSettings(ctx.db, pid),
        getProfileHabits(ctx.db, pid),
        listHabitTypes(ctx.db),
        ctx.db.from('nutrient_type').select('code, name, unit').eq('is_base', true),
      ]);
      const types = (typesRes.data ?? []) as Array<{ code: string; name: string; unit: string }>;
      const typeByCode = new Map(types.map((t) => [t.code, t]));
      const goalByCode = new Map(settings.goals.map((g) => [g.code, g]));
      const age = nutritionProfile?.birthYear ? Math.max(1, new Date().getFullYear() - nutritionProfile.birthYear) : null;
      const recos = await recommendTracking(ctx.db, {
        facets: selected,
        age,
        sex: nutritionProfile?.sex ?? null,
        isChild: nutritionProfile?.isChild ?? false,
        excludeNutrients: settings.tracked,
        excludeHabits: habits.map((h) => h.habitKey ?? '').filter(Boolean),
      });
      return JSON.stringify({
        active: !!nutritionProfile?.onboardedAt,
        mode_enfant: nutritionProfile?.isChild ?? false,
        facettes_cochees: selected,
        facettes_disponibles: facetDefs.map((f) => ({ key: f.key, label: f.label, groupe: f.groupe })),
        nutriments_suivis: settings.tracked.map((code) => {
          const g = goalByCode.get(code);
          const t = typeByCode.get(code);
          return { code, nom: t?.name ?? code, unite: t?.unit ?? '', zone_min: g?.min ?? null, zone_max: g?.max ?? null };
        }),
        nutriments_disponibles: types.map((t) => t.code),
        habitudes_suivies: habits.map((h) => ({ id: h.id, habitKey: h.habitKey, libelle: h.label, direction: h.direction, cible: h.targetCount, periode: h.period })),
        habitudes_catalogue: habitTypes.map((h) => ({ habitKey: h.key, libelle: h.label, repere: `${h.target_count}×/${h.period === 'week' ? 'semaine' : 'jour'}` })),
        recommandations_non_suivies: recos.map((r) => ({ type: r.kind, code: r.code, libelle: r.label, pourquoi: r.why })),
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
    case 'reconduct_meals': {
      const n = (a.mealIds as string[]).length;
      const dest = a.date
        ? `au ${a.date}`
        : a.offsetDays === 1
          ? 'au lendemain'
          : a.offsetDays === 7
            ? 'à la semaine suivante'
            : `à +${a.offsetDays} jour(s)`;
      return `Reconduire ${n} repas ${dest} (créneau conservé)`;
    }
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
    case 'set_facets':
      return `Mettre à jour ton profil nutrition (${(a.facets as string[]).length} facette(s))`;
    case 'track_nutrient': {
      const zone =
        a.min != null && a.max != null ? ` (zone ${a.min}–${a.max})` : a.min != null ? ` (≥ ${a.min})` : a.max != null ? ` (≤ ${a.max})` : '';
      return `Suivre le nutriment « ${a.code} »${zone}`;
    }
    case 'untrack_nutrient':
      return `Arrêter de suivre « ${a.code} »`;
    case 'add_habit':
      return `Suivre l’habitude « ${a.habitKey} »`;
    case 'add_custom_habit':
      return `Créer le repère « ${a.label} » (${a.direction === 'min' ? 'au moins' : 'au plus'} ${a.targetCount}× / ${a.period === 'week' ? 'semaine' : 'jour'})`;
    case 'remove_habit':
      return `Retirer l’habitude « ${a.idOrLabel} »`;
    case 'log_extra':
      return `Noter un extra : « ${a.label} » (${a.quantity} g/ml)`;
    case 'remove_extra':
      return `Retirer l’extra « ${a.idOrLabel} »`;
    case 'repair_nutrition_data':
      return `Réparer les données nutrition (relier les ingrédients au catalogue + compléter les valeurs manquantes)`;
    case 'rename_household':
      return `Renommer le foyer en « ${a.name} »`;
    case 'invite_member':
      return `Inviter ${a.email} dans le foyer (lien valable 7 jours)`;
    case 'cancel_invitation':
      return `Annuler l’invitation de ${a.email}`;
    case 'set_household_settings': {
      const parts: string[] = [];
      if (a.shoppingHorizonDays !== undefined) parts.push(`courses pour ${a.shoppingHorizonDays} j`);
      if (a.defaultServings !== undefined)
        parts.push(a.defaultServings === 0 ? 'portions par défaut = celles de la recette' : `${a.defaultServings} portions par défaut`);
      if (a.expiryThresholdDays !== undefined) parts.push(`alerte péremption à ${a.expiryThresholdDays} j`);
      return `Régler le foyer : ${parts.join(', ')}`;
    }
  }
}

/* --------------------------------- Boucle ----------------------------------- */

const SYSTEM_PROMPT = `Tu es l'assistant de Mealing (COURSES, STOCK, RECETTES, PLANNING, NUTRITION et FOYER).
Tu peux LIRE les données du foyer via des outils (liste, essentiels, rayons, historique, fiches produits, stats, catalogue ; stock : get_stock, get_expiring, list_locations ; recettes : list_recipes, recommend_recipes, get_recipe, list_recipe_groups ; planning : get_planning, get_past_meals ; nutrition : get_nutrition_summary, get_habits_progress, get_extras, get_tracking_plan, suggest_recipe_ideas ; foyer : get_household) — fais-le avant de répondre quand c'est utile.
Pour MODIFIER une donnée, tu DOIS APPELER l'outil d'écriture correspondant (ex. set_stock_location, add_items, discard_stock_item, remove_lines…). APPELER UN OUTIL D'ÉCRITURE = PROPOSER L'ACTION : ça N'EXÉCUTE RIEN. Le système met chaque appel dans un plan que l'utilisateur confirmera AVANT toute écriture réelle. Ne te contente donc JAMAIS de DÉCRIRE l'action en mots (ne réponds pas « je vais appeler set_stock_location… ») — ÉMETS réellement l'appel d'outil ; c'est sûr, rien n'est écrit sans confirmation. Tu ne supprimes JAMAIS un rayon ni un relevé d'historique.
Appelle chaque outil d'écriture UNE SEULE FOIS, puis donne une courte phrase de confirmation au FUTUR (« je vais déplacer… ») SANS prétendre que c'est déjà fait (l'utilisateur doit confirmer).
Tu n'inventes jamais un prix ni une valeur nutritionnelle : tu les obtiens via get_product_stats / get_nutrition.
Seules les données des OUTILS font foi : ne suppose jamais qu'une proposition passée a été appliquée (l'utilisateur a pu l'annuler). Pour lister/compter la liste, appelle get_shopping_list — ne te fie pas à l'historique de conversation.
Pour « prépare/complète ma liste » : lis la liste + les essentiels + (si demandé) l'historique, puis propose des add_items pertinents. Pour « reconduis mes dernières courses » : lis get_history puis propose reconduct_trip. Pour « nettoie ma liste » : propose remove_lines pour les doublons / ce qui est déjà en stock.
Pour le STOCK : lis get_stock (ids), get_expiring (ce qui périme), list_locations (clés de lieux), puis PROPOSE des écritures : ranger (set_stock_location), marquer entamé (mark_stock_opened), consommer (decrement_stock), ajouter (add_stock_item), estimer la conservation (estimate_conservation). « Jeter » (discard_stock_item) = gâché/périmé → compte dans le GASPILLAGE ; « retirer » (remove_stock_item) = correction/doublon, sans gaspillage — ne les confonds pas.
Pour les RECETTES : « que puis-je cuisiner ? » → recommend_recipes ne renvoie QUE les recettes DÉJÀ enregistrées (les plus réalisables avec le stock + manquants) ; détail d'une recette → get_recipe. Tu peux AUSSI INVENTER de NOUVELLES recettes qui ne sont pas dans la bibliothèque : lis get_stock, puis propose 1 à 3 idées réalistes en PRIVILÉGIANT les ingrédients disponibles (indique pour chacune les ingrédients à acheter en plus). Si l'utilisateur veut en garder une, utilise save_recipe pour l'enregistrer (nom + ingrédients + étapes ; la nutrition est calculée depuis le catalogue, jamais inventée par toi). Tu peux aussi : créer/renommer/supprimer un groupe (create_recipe_group / rename_recipe_group / delete_recipe_group), ranger une recette dans un groupe (assign_recipe_to_group), modifier les méta d'une recette (update_recipe : nom/portions/temps/description), et modifier ses INGRÉDIENTS (edit_recipe_ingredients : add/remove/update ciblés par nom — lis get_recipe avant pour connaître les ingrédients actuels). Désigne toujours recettes et groupes par leur NOM. Tu peux SUPPRIMER une recette (delete_recipe) — action destructive, mais comme toute écriture elle est confirmée avant d'être appliquée ; ne le fais que si c'est clairement demandé.
Pour le PLANNING : lis get_planning (ids des repas, portions, restes, repas individuels, écarts, jours hors-plan ; weekStart optionnel pour une semaine PASSÉE ou FUTURE) et get_past_meals (les plats des 12 dernières semaines : « qu'a-t-on mangé récemment ? », retrouver un plat à remettre), puis PROPOSE : planifier (add_meal : recette OU description, servings = portions, producesLeftover si batch), déplacer (move_meal), retirer (remove_meal), RECONDUIRE des repas existants (reconduct_meals : mealIds de get_planning + offsetDays 1 = lendemain / 7 = semaine suivante OU date fixe — créneau conservé, copies propres), signaler un écart (set_meal_deviation : sauté / différent+ate) ou l'annuler (clear_meal_deviation), marquer/réactiver une journée hors-plan (mark_day_off / unmark_day_off), gérer les restes (set_meal_leftover puis reassign_leftover : « tel quel » sans name, ou plat improvisé avec name — aucun achat généré), dupliquer une semaine (copy_week). Pour « que planifier cette semaine ? » : croise recommend_recipes (réalisables avec le stock) avec get_planning (créneaux vides) et propose des add_meal ; pense aussi à get_past_meals pour reproposer ce que le foyer aime. Toute écriture sur un repas précis (déplacer/retirer/reconduire/écart/reste) exige son \`id\` EXACT renvoyé par get_planning — appelle-le d'abord ; n'invente jamais un id.
Pour la NUTRITION : « où j'en suis ? » → get_nutrition_summary (planifié vs réel par nutriment suivi + zones min/max + statut + COUVERTURE des données, sur un jour ou la semaine) ; progression des habitudes → get_habits_progress (fait / à venir / prochaine occurrence) ; extras notés → get_extras. Ces chiffres viennent de la BASE — tu ne calcules jamais une valeur nutritionnelle toi-même (tu peux seulement les additionner/commenter). Pour la CONFIGURATION, lis get_tracking_plan (facettes, nutriments suivis + zones, habitudes suivies, catalogue, recommandations avec leur pourquoi), puis PROPOSE : suivre/arrêter un nutriment (track_nutrient / untrack_nutrient — n'invente JAMAIS une cible chiffrée : reprends celle des recommandations ou celle que l'utilisateur te donne, ex. son médecin), suivre une habitude du catalogue (add_habit), créer un repère personnalisé compté depuis le planning (add_custom_habit : « fermentés au moins 3×/semaine »), retirer une habitude (remove_habit), mettre à jour les facettes (set_facets). Pour AGIR sur un manque (« je suis bas en protéines », « 0/2 poisson gras ») : suggest_recipe_ideas (nutrientCode OU habitKey) → recettes du foyer les plus pertinentes avec réalisabilité stock, puis propose add_meal si l'utilisateur veut planifier. Si la couverture est faible (beaucoup d'ingrédients sans données), propose repair_nutrition_data. Si l'utilisateur dit avoir mangé quelque chose HORS planning (« j'ai pris un yaourt »), propose log_extra (quantité en g/ml — demande-la si absente) ; noté par erreur → remove_extra. Une donnée introuvable (collagène en mg…) : explique honnêtement qu'aucune base ne la couvre et propose l'équivalent en HABITUDE. Le plan de suivi et le bilan sont STRICTEMENT PERSONNELS — n'en parle jamais comme d'une donnée du foyer. MODE ENFANT : si get_nutrition_summary ou get_tracking_plan indique mode_enfant=true, ne mentionne JAMAIS les calories/kcal (ni chiffre ni objectif) — parle variété, familles d'aliments, découvertes.
Pour le FOYER : lis get_household (membres, invitations en attente, réglages), puis PROPOSE : renommer (rename_household), inviter quelqu'un (invite_member : email), annuler une invitation (cancel_invitation : email), régler la maison (set_household_settings : cadence de courses / portions par défaut d'un repas — les enfants sans compte comptent ici — / seuil d'alerte péremption). Ces actions sont réservées à l'admin (la base refuse sinon — transmets l'erreur avec bienveillance). Tu ne peux PAS retirer un membre, transférer le rôle d'admin ni faire quitter le foyer : renvoie vers la page Foyer pour ces gestes sensibles. La nutrition d'un membre ne se lit JAMAIS via toi (page Foyer, partage explicite uniquement).
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
  // profileId : requis par les lectures nutrition (plan de suivi PERSONNEL, RLS).
  const ctx: Ctx = { db, householdId: params.householdId, profileId: params.profileId };

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
    case 'reconduct_meals': {
      // Ids scellés côté foyer par reconductPlannedMeals (filtre household_id) — pas de fuite inter-foyers.
      const ids = (a.mealIds as string[]).filter((id) => UUID_RE.test(id.trim()));
      if (ids.length === 0) return NO_MEAL_ROW;
      const n = await reconductPlannedMeals(db, {
        householdId,
        mealIds: ids,
        offsetDays: a.offsetDays as number | undefined,
        date: a.date as string | undefined,
      });
      return n > 0 ? `${n} repas reconduit(s).` : NO_MEAL_ROW;
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

    /* ------------------------- Nutrition (N3) ------------------------- */
    // Toutes les écritures nutrition sont PERSONNELLES (profileId requis, RLS perso).
    case 'set_facets': {
      if (!ctx.profileId) return 'Profil inconnu — impossible de configurer la nutrition.';
      const valid = new Set((await listFacets(db)).map((f) => f.key));
      const keys = (a.facets as string[]).filter((k) => valid.has(k));
      await setProfileFacets(db, ctx.profileId, keys);
      return `Profil nutrition mis à jour (${keys.length} facette(s)).`;
    }
    case 'track_nutrient': {
      if (!ctx.profileId) return 'Profil inconnu — impossible de configurer la nutrition.';
      try {
        await trackNutrient(db, ctx.profileId, {
          code: String(a.code),
          min: (a.min as number | undefined) ?? null,
          max: (a.max as number | undefined) ?? null,
        });
      } catch (e) {
        return e instanceof Error ? e.message : 'Suivi impossible.';
      }
      return `Nutriment « ${a.code} » suivi.`;
    }
    case 'untrack_nutrient': {
      if (!ctx.profileId) return 'Profil inconnu — impossible de configurer la nutrition.';
      try {
        await untrackNutrient(db, ctx.profileId, String(a.code));
      } catch (e) {
        return e instanceof Error ? e.message : 'Retrait impossible.';
      }
      return `Suivi « ${a.code} » retiré.`;
    }
    case 'add_habit': {
      if (!ctx.profileId) return 'Profil inconnu — impossible de configurer la nutrition.';
      try {
        await addProfileHabit(db, ctx.profileId, String(a.habitKey));
      } catch (e) {
        return e instanceof Error ? e.message : 'Ajout impossible.';
      }
      return `Habitude « ${a.habitKey} » suivie.`;
    }
    case 'add_custom_habit': {
      if (!ctx.profileId) return 'Profil inconnu — impossible de configurer la nutrition.';
      await addCustomHabit(db, ctx.profileId, {
        label: String(a.label),
        direction: a.direction as 'min' | 'max',
        targetCount: a.targetCount as number,
        period: a.period as 'day' | 'week',
        matchTags: a.matchTags as string[],
      });
      return `Repère « ${a.label} » créé — compté depuis le planning.`;
    }
    case 'remove_habit': {
      if (!ctx.profileId) return 'Profil inconnu — impossible de configurer la nutrition.';
      const habits = await getProfileHabits(db, ctx.profileId);
      const q = normName(String(a.idOrLabel));
      const matches = habits.filter(
        (h) => h.id === a.idOrLabel || h.habitKey === a.idOrLabel || normName(h.label).includes(q) || q.includes(normName(h.label)),
      );
      if (matches.length === 0) return `Habitude « ${a.idOrLabel} » introuvable.`;
      if (matches.length > 1) return `Plusieurs habitudes correspondent à « ${a.idOrLabel} » — précise laquelle.`;
      await removeProfileHabit(db, ctx.profileId, matches[0].id);
      return `Habitude « ${matches[0].label} » retirée.`;
    }
    case 'log_extra': {
      if (!ctx.profileId) return 'Profil inconnu — impossible de noter un extra.';
      const label = String(a.label);
      // Résolution catalogue (même chemin que la saisie manuelle) : lien par libellé,
      // sinon création d'une fiche (nom/rayon/tags IA best-effort — nutrition fournisseur).
      let foodId = await findCatalogFoodIdByLabel(db, label);
      if (!foodId) foodId = await getOrCreateCatalogFood(db, { label });
      if (!foodId) return `Aliment « ${label} » introuvable.`;
      await addFoodExtra(db, ctx.profileId, { foodId, quantity: a.quantity as number });
      return `Extra « ${label} » noté (${a.quantity} g/ml) — compté dans ton réel.`;
    }
    case 'remove_extra': {
      if (!ctx.profileId) return 'Profil inconnu — impossible de retirer un extra.';
      const now = new Date();
      // Fenêtre 7 jours, triée du plus récent au plus ancien : sur un libellé, on
      // retire l'occurrence la plus récente (l'intention naturelle de « annule mon yaourt »).
      const extras = await listExtras(db, ctx.profileId, { from: isoDate(addDays(now, -7)), to: isoDate(now) });
      const q = String(a.idOrLabel).trim();
      let match = extras.find((e) => e.id === q);
      if (!match) {
        const nq = normName(q);
        match = extras.find((e) => {
          const nf = normName(e.foodName);
          return nf === nq || (nq.length >= 3 && (nf.includes(nq) || nq.includes(nf)));
        });
      }
      if (!match) return `Extra « ${q} » introuvable sur les 7 derniers jours.`;
      await removeExtra(db, ctx.profileId, match.id);
      return `Extra « ${match.foodName} » (${match.date}) retiré.`;
    }
    case 'repair_nutrition_data': {
      // Même passe bornée que le bouton « Compléter les données » (N0) : liens
      // ingrédients→catalogue + valeurs fournisseur USDA/OFF (jamais l'IA, n°3).
      const linked = await backfillRecipeIngredientLinks(db);
      const { data: rows } = await db.from('recipe_ingredient').select('food_id').not('food_id', 'is', null);
      const foodIds = Array.from(new Set((rows ?? []).map((r) => r.food_id as string)));
      const res = await completeMissingFoodNutrition(db, foodIds, { max: 12, concurrency: 3 });
      const remaining = Math.max(0, res.missing - res.completed);
      return `Données nutrition réparées : ${linked} ingrédient(s) relié(s), ${res.completed} aliment(s) complété(s)${remaining > 0 ? ` — ${remaining} restant(s), relance possible` : ''}.`;
    }

    /* ------------------------- Foyer ------------------------- */
    // Admin contrôlé EN BASE (fonctions DEFINER / policies) — l'erreur remonte en clair.
    case 'rename_household': {
      try {
        await renameHousehold(db, householdId, String(a.name));
      } catch (e) {
        return e instanceof Error ? e.message : 'Renommage impossible.';
      }
      return `Foyer renommé en « ${a.name} ».`;
    }
    case 'invite_member': {
      try {
        await inviteToHousehold(db, { householdId, email: String(a.email) });
      } catch (e) {
        return e instanceof Error ? e.message : 'Invitation impossible.';
      }
      return `Invitation créée pour ${a.email} — le lien (valable 7 jours) est sur la page Foyer.`;
    }
    case 'cancel_invitation': {
      const { data: inv } = await db
        .from('household_invitation')
        .select('id')
        .eq('household_id', householdId)
        .eq('status', 'pending')
        .ilike('email', String(a.email).trim())
        .maybeSingle();
      if (!inv?.id) return `Aucune invitation en attente pour ${a.email}.`;
      const { error } = await db.from('household_invitation').delete().eq('id', inv.id);
      if (error) return error.message;
      return `Invitation de ${a.email} annulée.`;
    }
    case 'set_household_settings': {
      const parts: string[] = [];
      try {
        if (a.shoppingHorizonDays !== undefined || a.defaultServings !== undefined) {
          await setHouseholdSettings(db, householdId, {
            shoppingHorizonDays: a.shoppingHorizonDays as number | undefined,
            // 0 = « revenir aux portions de la recette » (null en base).
            defaultServings: a.defaultServings === undefined ? undefined : a.defaultServings === 0 ? null : (a.defaultServings as number),
          });
          if (a.shoppingHorizonDays !== undefined) parts.push(`courses pour ${a.shoppingHorizonDays} j`);
          if (a.defaultServings !== undefined) parts.push('portions par défaut mises à jour');
        }
        if (a.expiryThresholdDays !== undefined) {
          await setNotificationPref(db, householdId, { expiryThresholdDays: a.expiryThresholdDays as number });
          parts.push(`alerte péremption à ${a.expiryThresholdDays} j`);
        }
      } catch (e) {
        return e instanceof Error ? e.message : 'Réglage impossible.';
      }
      return `Réglages du foyer mis à jour (${parts.join(', ')}).`;
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
