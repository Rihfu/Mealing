import {
  searchAllSources,
  getNutritionProvider,
  type FoodDetail,
  type NutritionSource,
} from '@/lib/providers/nutrition';
import type { DB } from './types';
import { unwrap } from './types';
import { normalizeLabel } from '@/lib/text';
import { SYNONYM_TO_SLUG } from '@/lib/food-synonyms';

/**
 * Importe (ou met à jour) un aliment issu d'un fournisseur nutritionnel dans la
 * table `food`, avec ses valeurs nutritionnelles. Les chiffres proviennent
 * TOUJOURS du fournisseur, jamais d'une génération (principe n°3).
 *
 * Idempotent : ré-importer le même (source, external_id) met à jour les valeurs.
 * @returns l'id du food.
 */
export async function importFood(db: DB, detail: FoodDetail): Promise<string> {
  const existing = await db
    .from('food')
    .select('id')
    .eq('source', detail.source)
    .eq('external_id', detail.externalId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  let foodId: string;
  if (existing.data) {
    foodId = existing.data.id;
  } else {
    const {
      data: { user },
    } = await db.auth.getUser();

    // Aliment externe (USDA/OFF) : on simplifie l'appellation (nom générique FR,
    // sans marque) et on lui attribue un rayon, par IA (best-effort). La NUTRITION
    // reste celle du fournisseur — garde-fou n°3. Import dynamique pour ne pas
    // coupler tout `core` à la couche IA ; tout échec retombe sur le nom brut.
    let classified: { name: string; category: string | null } | null = null;
    try {
      const { classifyImportedFood } = await import('@/lib/ai/categorize-food');
      classified = await classifyImportedFood(detail.name);
    } catch {
      classified = null;
    }

    const inserted = unwrap(
      await db
        .from('food')
        .insert({
          name: classified?.name ?? detail.name,
          source: detail.source,
          external_id: detail.externalId,
          barcode: detail.barcode ?? null,
          default_unit: detail.baseUnit,
          base_amount: detail.baseAmount,
          category: classified?.category ?? null,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single(),
    ) as { id: string };
    foodId = inserted.id;
  }

  if (detail.nutrients.length === 0) return foodId;

  // Résoudre les codes de nutriments vers leurs ids de référentiel.
  const codes = detail.nutrients.map((n) => n.code);
  const types = (unwrap(
    await db.from('nutrient_type').select('id, code').in('code', codes),
  ) ?? []) as Array<{ id: string; code: string }>;
  const codeToId = new Map(types.map((t) => [t.code, t.id]));

  const rows = detail.nutrients
    .filter((n) => codeToId.has(n.code))
    .map((n) => ({
      food_id: foodId,
      nutrient_type_id: codeToId.get(n.code) as string,
      amount: n.amount,
    }));

  if (rows.length > 0) {
    const { error } = await db
      .from('nutrient_value')
      .upsert(rows, { onConflict: 'food_id,nutrient_type_id' });
    if (error) throw new Error(error.message);
  }

  return foodId;
}

/** Un format/conditionnement courant d'un aliment (ex. « 1 kg », « pack de 6 »). */
export interface FoodPackageOption {
  label: string;
  quantity: number;
  unit: string | null;
  isDefault: boolean;
}

/** Une suggestion d'autocomplétion. `foodId` null = résultat externe à importer à la sélection. */
export interface FoodSuggestion {
  foodId: string | null;
  name: string;
  defaultUnit: string | null;
  category: string | null;
  source: string; // 'manual' | 'usda' | 'openfoodfacts'
  externalId: string | null; // pour l'import paresseux si foodId est null
  packages: FoodPackageOption[];
}

/**
 * Recherche d'aliments pour l'autocomplétion (chantier D, stratégie hybride) :
 * le catalogue local `food` d'abord, complété au besoin par les fournisseurs
 * (USDA/OFF). Les résultats externes ont `foodId = null` et seront importés à la
 * sélection (peuplement paresseux). Les conditionnements sont joints pour les
 * aliments locaux. Une source externe indisponible ne casse pas l'autocomplétion.
 */
export async function searchFoodCatalog(
  db: DB,
  query: string,
  opts?: { limit?: number; includeExternal?: boolean },
): Promise<FoodSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const limit = opts?.limit ?? 8;

  const localRows = (unwrap(
    await db
      .from('food')
      .select('id, name, default_unit, category, source')
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .limit(limit),
  ) ?? []) as Array<{
    id: string;
    name: string;
    default_unit: string | null;
    category: string | null;
    source: string;
  }>;

  const packagesByFood = new Map<string, FoodPackageOption[]>();
  if (localRows.length > 0) {
    const pkgs = (unwrap(
      await db
        .from('food_package')
        .select('food_id, label, quantity, unit, is_default, position')
        .in(
          'food_id',
          localRows.map((f) => f.id),
        )
        .order('position', { ascending: true }),
    ) ?? []) as Array<{
      food_id: string;
      label: string;
      quantity: number;
      unit: string | null;
      is_default: boolean;
    }>;
    for (const p of pkgs) {
      const list = packagesByFood.get(p.food_id) ?? [];
      list.push({ label: p.label, quantity: p.quantity, unit: p.unit, isDefault: p.is_default });
      packagesByFood.set(p.food_id, list);
    }
  }

  const suggestions: FoodSuggestion[] = localRows.map((f) => ({
    foodId: f.id,
    name: f.name,
    defaultUnit: f.default_unit,
    category: f.category,
    source: f.source,
    externalId: null,
    packages: packagesByFood.get(f.id) ?? [],
  }));

  if (opts?.includeExternal !== false && suggestions.length < limit) {
    const seen = new Set(suggestions.map((s) => s.name.toLowerCase()));
    try {
      const ext = await searchAllSources(q, { limit: limit - suggestions.length });
      for (const e of ext) {
        const key = e.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        suggestions.push({
          foodId: null,
          name: e.name,
          defaultUnit: null,
          category: null,
          source: e.source,
          externalId: e.externalId,
          packages: [],
        });
      }
    } catch {
      // Source externe indisponible : on garde les résultats locaux.
    }
  }

  return suggestions;
}

/** Un aliment du catalogue curé, indexé pour le rapprochement par libellé. */
export interface CatalogEntry {
  id: string;
  slug: string; // external_id sans le préfixe 'cat:'
  name: string;
  category: string | null; // clé de rayon stable
}

/** Index du catalogue curé pour rapprocher des libellés (chargé une fois). */
export interface CatalogIndex {
  byNorm: Map<string, CatalogEntry>; // normalizeLabel(name) → entrée
  bySlug: Map<string, CatalogEntry>; // slug → entrée
}

/**
 * Charge le catalogue curé (source 'manual', external_id 'cat:%') et l'indexe par
 * libellé normalisé et par slug. À appeler une fois puis réutiliser avec `matchCatalog`.
 */
export async function loadCatalogIndex(db: DB): Promise<CatalogIndex> {
  const rows = (unwrap(
    await db
      .from('food')
      .select('id, name, category, external_id')
      .eq('source', 'manual')
      .like('external_id', 'cat:%'),
  ) ?? []) as Array<{ id: string; name: string; category: string | null; external_id: string | null }>;
  const byNorm = new Map<string, CatalogEntry>();
  const bySlug = new Map<string, CatalogEntry>();
  for (const r of rows) {
    const slug = (r.external_id ?? '').replace(/^cat:/, '');
    const entry: CatalogEntry = { id: r.id, slug, name: r.name, category: r.category };
    byNorm.set(normalizeLabel(r.name), entry);
    if (slug) bySlug.set(slug, entry);
  }
  return { byNorm, bySlug };
}

/**
 * Rapproche un libellé libre d'un aliment du catalogue : d'abord correspondance
 * exacte normalisée (accents/casse/pluriel/œ neutralisés), puis table de synonymes
 * (formulations courantes des recettes IA → slug canonique). Conservateur, pas de
 * fuzzy → pas de mauvais lien. Donne rayon + icône aux libellés libres.
 */
export function matchCatalog(index: CatalogIndex, label: string): CatalogEntry | null {
  const n = normalizeLabel(label);
  if (!n) return null;
  const direct = index.byNorm.get(n);
  if (direct) return direct;
  const slug = SYNONYM_TO_SLUG.get(n);
  return (slug && index.bySlug.get(slug)) || null;
}

/**
 * Rapproche un libellé libre du catalogue et renvoie l'id de l'aliment (identité
 * produit stable pour les ajouts manuels). Voir `matchCatalog` pour la stratégie.
 * @returns l'id de l'aliment de catalogue correspondant, sinon null.
 */
export async function findCatalogFoodIdByLabel(db: DB, label: string): Promise<string | null> {
  const index = await loadCatalogIndex(db);
  return matchCatalog(index, label)?.id ?? null;
}

/**
 * Importe un aliment externe (suggestion sans `foodId`) dans le catalogue local
 * et renvoie son id — à appeler quand l'utilisateur sélectionne une suggestion
 * externe. Réutilise `importFood` (valeurs nutritionnelles depuis le fournisseur).
 */
export async function importFoodByRef(
  db: DB,
  source: NutritionSource,
  externalId: string,
): Promise<string | null> {
  const detail = await getNutritionProvider(source).getByExternalId(externalId);
  if (!detail) return null;
  return importFood(db, detail);
}

/** Une valeur nutritionnelle lue pour un aliment (toujours d'un fournisseur, n°3). */
export interface FoodNutritionValue {
  code: string;
  name: string;
  unit: string;
  amount: number;
  isBase: boolean;
}

/** Valeurs nutritionnelles STOCKÉES d'un aliment (null si aucune). Lecture seule. */
export async function getFoodNutrition(db: DB, foodId: string): Promise<FoodNutritionValue[] | null> {
  const rows = (unwrap(
    await db
      .from('nutrient_value')
      .select('amount, nutrient_type:nutrient_type_id(code, name, unit, is_base, category)')
      .eq('food_id', foodId),
  ) ?? []) as Array<{
    amount: number;
    nutrient_type: { code: string; name: string; unit: string; is_base: boolean } | { code: string; name: string; unit: string; is_base: boolean }[] | null;
  }>;
  if (rows.length === 0) return null;
  const values = rows
    .map((r) => {
      const t = Array.isArray(r.nutrient_type) ? r.nutrient_type[0] : r.nutrient_type;
      return t ? { code: t.code, name: t.name, unit: t.unit, amount: r.amount, isBase: t.is_base } : null;
    })
    .filter((v): v is FoodNutritionValue => v != null)
    .sort((a, b) => (a.isBase === b.isBase ? 0 : a.isBase ? -1 : 1));
  return values.length > 0 ? values : null;
}

/**
 * Récupère la nutrition d'un aliment auprès du fournisseur (USDA/OFF) par son nom,
 * et la PERSISTE sur cet aliment (`nutrient_value`) pour réutilisation. Garde-fou
 * n°3 : valeurs du fournisseur, jamais de l'IA. @returns le nb de nutriments stockés.
 */
export async function fetchAndStoreNutrition(db: DB, foodId: string): Promise<number> {
  const { data: food } = await db.from('food').select('id, name').eq('id', foodId).maybeSingle();
  if (!food) return 0;

  // Les bases fournisseurs (USDA surtout) sont anglophones : le nom FR générique
  // ne matche pas. On traduit le terme de recherche (l'IA ne fournit QUE le mot-clé ;
  // les valeurs viennent du fournisseur, garde-fou n°3). Repli sur le nom FR.
  let englishTerm = '';
  try {
    const { toEnglishFoodTerm } = await import('@/lib/ai/translate-food');
    englishTerm = await toEnglishFoodTerm(food.name);
  } catch {
    englishTerm = '';
  }

  const queries = [englishTerm, food.name].filter((q): q is string => !!q.trim());
  const seen = new Set<string>();
  let detail: FoodDetail | null = null;
  for (const q of queries) {
    const summaries = await searchAllSources(q, { limit: 5 });
    for (const s of summaries) {
      const k = `${s.source}:${s.externalId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const d = await getNutritionProvider(s.source).getByExternalId(s.externalId);
      if (d && d.nutrients.length > 0) {
        detail = d;
        break;
      }
    }
    if (detail) break;
  }
  if (!detail) return 0;

  const codes = detail.nutrients.map((n) => n.code);
  const types = (unwrap(
    await db.from('nutrient_type').select('id, code').in('code', codes),
  ) ?? []) as Array<{ id: string; code: string }>;
  const codeToId = new Map(types.map((t) => [t.code, t.id]));
  const rows = detail.nutrients
    .filter((n) => codeToId.has(n.code))
    .map((n) => ({ food_id: foodId, nutrient_type_id: codeToId.get(n.code) as string, amount: n.amount }));
  if (rows.length === 0) return 0;
  const { error } = await db.from('nutrient_value').upsert(rows, { onConflict: 'food_id,nutrient_type_id' });
  if (error) throw new Error(error.message);
  return rows.length;
}
