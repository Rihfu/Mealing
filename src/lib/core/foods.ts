import {
  searchAllSources,
  getNutritionProvider,
  type FoodDetail,
  type NutritionSource,
} from '@/lib/providers/nutrition';
import type { DB } from './types';
import { unwrap } from './types';
import { normalizeLabel } from '@/lib/text';

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
    const inserted = unwrap(
      await db
        .from('food')
        .insert({
          name: detail.name,
          source: detail.source,
          external_id: detail.externalId,
          barcode: detail.barcode ?? null,
          default_unit: detail.baseUnit,
          base_amount: detail.baseAmount,
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

/**
 * Rapproche un libellé libre d'un aliment du CATALOGUE curé (source 'manual',
 * external_id 'cat:%') par libellé normalisé (accents/casse/pluriel/œ neutralisés).
 * Donne une identité produit stable — donc un rayon et une icône — aux ajouts en
 * texte libre, sans que l'utilisateur ait à cliquer une suggestion. Conservateur :
 * uniquement sur correspondance exacte normalisée (pas de fuzzy → pas de mauvais lien).
 * @returns l'id de l'aliment de catalogue correspondant, sinon null.
 */
export async function findCatalogFoodIdByLabel(db: DB, label: string): Promise<string | null> {
  const target = normalizeLabel(label);
  if (!target) return null;
  const rows = (unwrap(
    await db.from('food').select('id, name').eq('source', 'manual').like('external_id', 'cat:%'),
  ) ?? []) as Array<{ id: string; name: string }>;
  return rows.find((r) => normalizeLabel(r.name) === target)?.id ?? null;
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
