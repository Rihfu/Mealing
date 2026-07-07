import type { DB } from './types';
import { unwrap } from './types';

/**
 * N1.5 Nutrition — facettes du profil + MOTEUR DE RECOMMANDATION.
 *
 * Le moteur lit la table CURÉE `tracking_rule` (facettes → suivi + « pourquoi »
 * sourcé) : aucune valeur inventée (n°3), éditable sans redéploiement (principe n°8).
 * Il ne PROPOSE que des suivis — l'utilisateur active/refuse/règle chaque carte.
 */

export interface FacetDef {
  key: string;
  label: string;
  groupe: 'activite' | 'alimentation' | 'objectif';
  ordre: number;
}

/** Référentiel des facettes (ordonné par groupe puis ordre). */
export async function listFacets(db: DB): Promise<FacetDef[]> {
  const rows = (unwrap(await db.from('facet').select('key, label, groupe, ordre').order('groupe').order('ordre')) ??
    []) as FacetDef[];
  return rows;
}

/** Facettes cochées par un profil (RLS personnelle). */
export async function getProfileFacets(db: DB, profileId: string): Promise<string[]> {
  const rows = (unwrap(await db.from('profile_facet').select('facet_key').eq('profile_id', profileId)) ?? []) as Array<{
    facet_key: string;
  }>;
  return rows.map((r) => r.facet_key);
}

/** Remplace l'ensemble des facettes d'un profil. */
export async function setProfileFacets(db: DB, profileId: string, keys: string[]): Promise<void> {
  const del = await db.from('profile_facet').delete().eq('profile_id', profileId);
  if (del.error) throw new Error(del.error.message);
  const uniq = Array.from(new Set(keys));
  if (uniq.length === 0) return;
  const ins = await db.from('profile_facet').insert(uniq.map((k) => ({ profile_id: profileId, facet_key: k })));
  if (ins.error) throw new Error(ins.error.message);
}

/* ------------------------------ Moteur ------------------------------ */

interface RuleRow {
  required_facets: string[];
  sex: string | null;
  age_min: number | null;
  age_max: number | null;
  kind: 'nutrient' | 'habit';
  nutrient_code: string | null;
  habit_key: string | null;
  why_text: string;
  priority: number;
  child_only: boolean;
}

export interface TrackingSuggestion {
  kind: 'nutrient' | 'habit';
  /** nutrient_code (quanti) OU habit_key (habitude). */
  code: string;
  label: string;
  why: string;
  priority: number;
  /** Habitude : repère par défaut affichable (« 2× / semaine »). */
  habit?: { targetCount: number; period: 'day' | 'week' };
  /** Nutriment : unité affichable. */
  unit?: string;
}

export interface RecommendInput {
  facets: string[];
  age: number | null;
  sex: 'male' | 'female' | null;
  isChild: boolean;
  /** Cibles déjà suivies à exclure des propositions. */
  excludeNutrients?: string[];
  excludeHabits?: string[];
  /** Plafond de propositions (la pertinence EST le produit). */
  cap?: number;
}

/**
 * Recommande un plan de suivi à partir des facettes : règles dont
 * `required_facets ⊆ facettes` (+ filtres âge/sexe/enfant), dédoublonnées par
 * cible (on garde la meilleure priorité), triées par priorité, plafonnées.
 */
export async function recommendTracking(db: DB, input: RecommendInput): Promise<TrackingSuggestion[]> {
  const [rulesRes, nutrientsRes, habitsRes] = await Promise.all([
    db
      .from('tracking_rule')
      .select('required_facets, sex, age_min, age_max, kind, nutrient_code, habit_key, why_text, priority, child_only'),
    db.from('nutrient_type').select('code, name, unit'),
    db.from('habit_type').select('key, label, target_count, period'),
  ]);
  const rules = (unwrap(rulesRes) ?? []) as RuleRow[];
  const nutrients = new Map(
    ((unwrap(nutrientsRes) ?? []) as Array<{ code: string; name: string; unit: string }>).map((n) => [n.code, n]),
  );
  const habits = new Map(
    ((unwrap(habitsRes) ?? []) as Array<{ key: string; label: string; target_count: number; period: 'day' | 'week' }>).map(
      (h) => [h.key, h],
    ),
  );

  const facetSet = new Set(input.facets);
  const excludeN = new Set(input.excludeNutrients ?? []);
  const excludeH = new Set(input.excludeHabits ?? []);

  const matches = rules.filter((r) => {
    if (r.child_only !== input.isChild) return false;
    if (!r.required_facets.every((f) => facetSet.has(f))) return false;
    if (r.sex && r.sex !== input.sex) return false;
    // Règle bornée en âge : ignorée si l'âge est inconnu (on ne devine pas).
    if (r.age_min != null || r.age_max != null) {
      if (input.age == null) return false;
      if (r.age_min != null && input.age < r.age_min) return false;
      if (r.age_max != null && input.age > r.age_max) return false;
    }
    return true;
  });

  // Dédoublonnage PAR CIBLE : meilleure priorité (nombre le plus bas) gagne.
  const byTarget = new Map<string, TrackingSuggestion>();
  for (const r of matches) {
    const isNutrient = r.kind === 'nutrient';
    const code = (isNutrient ? r.nutrient_code : r.habit_key) as string;
    if (isNutrient && excludeN.has(code)) continue;
    if (!isNutrient && excludeH.has(code)) continue;
    const key = `${r.kind}:${code}`;
    const existing = byTarget.get(key);
    if (existing && existing.priority <= r.priority) continue;

    if (isNutrient) {
      const n = nutrients.get(code);
      if (!n) continue;
      byTarget.set(key, { kind: 'nutrient', code, label: n.name, why: r.why_text, priority: r.priority, unit: n.unit });
    } else {
      const h = habits.get(code);
      if (!h) continue;
      byTarget.set(key, {
        kind: 'habit',
        code,
        label: h.label,
        why: r.why_text,
        priority: r.priority,
        habit: { targetCount: h.target_count, period: h.period },
      });
    }
  }

  return Array.from(byTarget.values())
    .sort((a, b) => a.priority - b.priority)
    .slice(0, input.cap ?? 6);
}
