import type { DB } from './types';
import { unwrap } from './types';

/**
 * N1 Nutrition — profil nutritionnel privé, personas et calcul des CIBLES.
 *
 * Garde-fous :
 * - n°3 : les cibles viennent d'une table de référence CURÉE (`nutrient_reference`,
 *   AJR ANSES simplifiés) ou d'une formule standard (Mifflin-St Jeor) — jamais d'IA.
 * - éthique enfant : un profil « enfant » n'a JAMAIS de cible ni d'affichage kcal
 *   (imposé côté serveur dans `applyNutritionSetup`, pas seulement à l'UI).
 * - vie privée : tout vit dans `nutrition_profile` (RLS strictement personnelle) —
 *   le foyer ne voit ni persona ni infos corporelles.
 *
 * NB : ce module n'importe QUE `./types` → importable par des composants client
 * (constantes PERSONAS…) sans tirer les dépendances serveur du barrel `core`.
 */

export type PersonaId = 'equilibre' | 'sportif' | 'perte_poids' | 'vegetarien' | 'enfant';
export type ActivityLevel = 'sedentaire' | 'leger' | 'modere' | 'eleve';
export type Sex = 'male' | 'female';

export interface PersonaDef {
  id: PersonaId;
  label: string;
  description: string;
  /** Codes des nutriments suivis par défaut. */
  tracked: string[];
  /** Protéines en g/kg de poids corporel (si le poids est renseigné). */
  proteinPerKg?: number;
  /** Facteur appliqué au besoin énergétique (perte de poids douce = déficit doux). */
  energyFactor?: number;
  /** Mode enfant : kcal jamais affichées ni ciblées. */
  child?: boolean;
}

/** Les 5 personas V1 (décision utilisateur 2026-07-06). */
export const PERSONAS: PersonaDef[] = [
  {
    id: 'equilibre',
    label: 'Équilibre',
    description: 'Manger varié et équilibré au quotidien, sans comptage fin.',
    tracked: ['energy_kcal', 'protein', 'fat', 'carbs', 'fiber', 'sodium'],
  },
  {
    id: 'sportif',
    label: 'Sportif',
    description: 'Soutenir l’entraînement : protéines, énergie, glucides.',
    tracked: ['energy_kcal', 'protein', 'carbs', 'iron'],
    proteinPerKg: 1.6,
  },
  {
    id: 'perte_poids',
    label: 'Perte de poids douce',
    description: 'Un déficit doux et tenable, protéines préservées (satiété).',
    tracked: ['energy_kcal', 'protein', 'sugars', 'fiber'],
    proteinPerKg: 1.2,
    energyFactor: 0.85,
  },
  {
    id: 'vegetarien',
    label: 'Végétarien',
    description: 'Veiller aux nutriments clés d’une alimentation sans viande.',
    tracked: ['protein', 'iron', 'vitamin_b12', 'calcium'],
  },
  {
    id: 'enfant',
    label: 'Enfant',
    description: 'Variété et équilibre — les calories ne sont jamais affichées.',
    tracked: ['fiber', 'calcium', 'iron'],
    child: true,
  },
];

export const personaById = (id: string | null | undefined): PersonaDef | null =>
  PERSONAS.find((p) => p.id === id) ?? null;

/** Facteurs d'activité (formule standard TDEE). */
export const ACTIVITY_LEVELS: Array<{ id: ActivityLevel; label: string; factor: number }> = [
  { id: 'sedentaire', label: 'Sédentaire', factor: 1.2 },
  { id: 'leger', label: 'Activité légère', factor: 1.375 },
  { id: 'modere', label: 'Activité modérée', factor: 1.55 },
  { id: 'eleve', label: 'Très actif', factor: 1.725 },
];

/* ------------------------------ Profil privé ------------------------------ */

export interface NutritionProfileData {
  persona: PersonaId | null;
  birthYear: number | null;
  sex: Sex | null;
  weightKg: number | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  onboardedAt: string | null;
}

/** Lit le profil nutritionnel PRIVÉ (null si jamais configuré). */
export async function getNutritionProfile(db: DB, profileId: string): Promise<NutritionProfileData | null> {
  // maybeSingle SANS unwrap (règle projet) : l'absence de ligne est un cas normal.
  const { data, error } = await db
    .from('nutrition_profile')
    .select('persona, birth_year, sex, weight_kg, height_cm, activity_level, onboarded_at')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    persona: (data.persona as PersonaId | null) ?? null,
    birthYear: data.birth_year,
    sex: (data.sex as Sex | null) ?? null,
    weightKg: data.weight_kg != null ? Number(data.weight_kg) : null,
    heightCm: data.height_cm != null ? Number(data.height_cm) : null,
    activityLevel: (data.activity_level as ActivityLevel | null) ?? null,
    onboardedAt: data.onboarded_at,
  };
}

/* ------------------------------ Cibles ------------------------------ */

export interface TargetZone {
  code: string;
  name: string;
  unit: string;
  category: string;
  min: number | null;
  max: number | null;
  /** Transparence : d'où vient la proposition. */
  basis: 'reference' | 'formule' | 'persona' | 'derive' | 'aucune';
}

export interface ComputeTargetsInput {
  persona: PersonaId;
  birthYear?: number | null;
  sex?: Sex | null;
  weightKg?: number | null;
  heightCm?: number | null;
  activityLevel?: ActivityLevel | null;
}

interface ReferenceRow {
  sex: Sex | null;
  age_min: number;
  age_max: number;
  target_min: number | null;
  target_max: number | null;
  nutrient_type: { code: string } | { code: string }[] | null;
}

const round0 = (n: number) => Math.round(n);
const round10 = (n: number) => Math.round(n / 10) * 10;

/**
 * Sélectionne la référence la plus SPÉCIFIQUE pour un nutriment : bande d'âge la
 * plus étroite, sexe exact prioritaire sur « tous sexes ». Sans sexe renseigné :
 * moyenne des repères homme/femme quand il n'existe pas de ligne neutre.
 */
function pickReference(rows: ReferenceRow[], code: string, age: number, sex: Sex | null): { min: number | null; max: number | null } | null {
  const ofCode = rows.filter((r) => {
    const nt = Array.isArray(r.nutrient_type) ? r.nutrient_type[0] : r.nutrient_type;
    return nt?.code === code && age >= r.age_min && age <= r.age_max;
  });
  if (ofCode.length === 0) return null;

  const width = (r: ReferenceRow) => r.age_max - r.age_min;
  if (sex) {
    const exact = ofCode.filter((r) => r.sex === sex).sort((a, b) => width(a) - width(b));
    if (exact.length > 0) return { min: exact[0].target_min, max: exact[0].target_max };
  }
  const neutral = ofCode.filter((r) => r.sex === null).sort((a, b) => width(a) - width(b));
  if (neutral.length > 0) return { min: neutral[0].target_min, max: neutral[0].target_max };

  // Sexe non renseigné mais références sexuées : moyenne des repères (approximation n°2).
  const male = ofCode.filter((r) => r.sex === 'male').sort((a, b) => width(a) - width(b))[0];
  const female = ofCode.filter((r) => r.sex === 'female').sort((a, b) => width(a) - width(b))[0];
  if (male && female) {
    const avg = (a: number | null, b: number | null) => (a != null && b != null ? (a + b) / 2 : (a ?? b));
    return { min: avg(male.target_min, female.target_min), max: avg(male.target_max, female.target_max) };
  }
  const any = ofCode.sort((a, b) => width(a) - width(b))[0];
  return { min: any.target_min, max: any.target_max };
}

/**
 * Calcule les cibles PROPOSÉES (modifiables par l'utilisateur à l'écran suivant) :
 * - énergie : Mifflin-St Jeor × activité si les infos corporelles sont là, sinon
 *   repère ANSES par âge/sexe ; × facteur persona (déficit doux) ; JAMAIS pour un enfant.
 * - protéines : g/kg selon persona si poids connu, sinon repère.
 * - lipides / glucides : dérivés de l'énergie (35-40 % / 40-55 % de l'AET).
 * - autres : repères curés (`nutrient_reference`).
 */
export async function computeNutritionTargets(db: DB, input: ComputeTargetsInput): Promise<TargetZone[]> {
  const persona = personaById(input.persona);
  if (!persona) throw new Error('Persona inconnu.');

  const [typesRes, refsRes] = await Promise.all([
    db.from('nutrient_type').select('code, name, unit, category').eq('is_base', true),
    db
      .from('nutrient_reference')
      .select('sex, age_min, age_max, target_min, target_max, nutrient_type:nutrient_type_id(code)'),
  ]);
  const types = (unwrap(typesRes) ?? []) as Array<{ code: string; name: string; unit: string; category: string }>;
  const refs = (unwrap(refsRes) ?? []) as unknown as ReferenceRow[];

  const now = new Date().getFullYear();
  // Âge par défaut sans année de naissance : 30 ans (bande adulte) — 8 ans pour un enfant.
  const age = input.birthYear ? Math.max(1, now - input.birthYear) : persona.child ? 8 : 30;
  const sex = input.sex ?? null;

  // Énergie (kcal/j) — jamais calculée pour un profil enfant.
  let energyMin: number | null = null;
  let energyMax: number | null = null;
  let energyBasis: TargetZone['basis'] = 'aucune';
  if (!persona.child) {
    const factor = persona.energyFactor ?? 1;
    if (input.weightKg && input.heightCm && sex && input.birthYear) {
      const bmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * age + (sex === 'male' ? 5 : -161);
      const act = ACTIVITY_LEVELS.find((a) => a.id === input.activityLevel)?.factor ?? 1.375;
      const tdee = bmr * act * factor;
      energyMin = round10(tdee * 0.95);
      energyMax = round10(tdee * 1.05);
      energyBasis = 'formule';
    } else {
      const ref = pickReference(refs, 'energy_kcal', age, sex);
      if (ref) {
        energyMin = ref.min != null ? round10(ref.min * factor) : null;
        energyMax = ref.max != null ? round10(ref.max * factor) : null;
        energyBasis = 'reference';
      }
    }
  }
  const energyMid = energyMin != null && energyMax != null ? (energyMin + energyMax) / 2 : (energyMin ?? energyMax);

  const zones: TargetZone[] = [];
  for (const t of types) {
    let min: number | null = null;
    let max: number | null = null;
    let basis: TargetZone['basis'] = 'aucune';

    if (t.code === 'energy_kcal') {
      if (persona.child) continue; // éthique : jamais de cible kcal pour un enfant.
      min = energyMin;
      max = energyMax;
      basis = energyBasis;
    } else if (t.code === 'protein' && persona.proteinPerKg && input.weightKg) {
      min = round0(persona.proteinPerKg * input.weightKg);
      basis = 'persona';
    } else if (t.code === 'fat' && energyMid != null) {
      // 35-40 % de l'AET (9 kcal/g).
      min = round0((0.35 * energyMid) / 9);
      max = round0((0.4 * energyMid) / 9);
      basis = 'derive';
    } else if (t.code === 'carbs' && energyMid != null) {
      // 40-55 % de l'AET (4 kcal/g).
      min = round0((0.4 * energyMid) / 4);
      max = round0((0.55 * energyMid) / 4);
      basis = 'derive';
    } else {
      const ref = pickReference(refs, t.code, age, sex);
      if (ref) {
        min = ref.min;
        max = ref.max;
        basis = 'reference';
      }
    }
    zones.push({ code: t.code, name: t.name, unit: t.unit, category: t.category, min, max, basis });
  }
  return zones;
}

/* ------------------------------ Application ------------------------------ */

export interface NutritionSetupInput {
  persona: PersonaId;
  birthYear?: number | null;
  sex?: Sex | null;
  weightKg?: number | null;
  heightCm?: number | null;
  activityLevel?: ActivityLevel | null;
  /** Cibles FINALES validées (modifiées ou non) par l'utilisateur. */
  targets: Array<{ code: string; min: number | null; max: number | null }>;
  /** Codes des nutriments à suivre. */
  tracked: string[];
}

/**
 * Applique la configuration nutrition d'un profil, en une passe :
 * 1. upsert du profil privé (`nutrition_profile`) ;
 * 2. remplacement des nutriments suivis (`profile_nutrient_tracking`) ;
 * 3. remplacement des objectifs quotidiens (`profile_goal`, min ET max).
 * Un persona « enfant » ne peut NI suivre NI cibler l'énergie (imposé ici).
 */
export async function applyNutritionSetup(db: DB, profileId: string, input: NutritionSetupInput): Promise<void> {
  const persona = personaById(input.persona);
  if (!persona) throw new Error('Persona inconnu.');

  const tracked = persona.child ? input.tracked.filter((c) => c !== 'energy_kcal') : input.tracked;
  const targets = (persona.child ? input.targets.filter((t) => t.code !== 'energy_kcal') : input.targets).filter(
    (t) => t.min != null || t.max != null,
  );

  const up = await db.from('nutrition_profile').upsert(
    {
      profile_id: profileId,
      persona: input.persona,
      birth_year: input.birthYear ?? null,
      sex: input.sex ?? null,
      weight_kg: input.weightKg ?? null,
      height_cm: input.heightCm ?? null,
      activity_level: input.activityLevel ?? null,
      onboarded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id' },
  );
  if (up.error) throw new Error(up.error.message);

  const types = (unwrap(await db.from('nutrient_type').select('id, code').eq('is_base', true)) ?? []) as Array<{
    id: string;
    code: string;
  }>;
  const idByCode = new Map(types.map((t) => [t.code, t.id]));

  // Nutriments suivis : remplacement complet.
  const delTracking = await db.from('profile_nutrient_tracking').delete().eq('profile_id', profileId);
  if (delTracking.error) throw new Error(delTracking.error.message);
  const trackingRows = tracked
    .filter((c) => idByCode.has(c))
    .map((c) => ({ profile_id: profileId, nutrient_type_id: idByCode.get(c) as string }));
  if (trackingRows.length > 0) {
    const ins = await db.from('profile_nutrient_tracking').insert(trackingRows);
    if (ins.error) throw new Error(ins.error.message);
  }

  // Objectifs quotidiens : remplacement complet (min ET max — l'ancienne UI ne gérait que max).
  const delGoals = await db.from('profile_goal').delete().eq('profile_id', profileId).eq('period', 'daily');
  if (delGoals.error) throw new Error(delGoals.error.message);
  const goalRows = targets
    .filter((t) => idByCode.has(t.code))
    .map((t) => ({
      profile_id: profileId,
      nutrient_type_id: idByCode.get(t.code) as string,
      period: 'daily',
      target_min: t.min,
      target_max: t.max,
    }));
  if (goalRows.length > 0) {
    const ins = await db.from('profile_goal').insert(goalRows);
    if (ins.error) throw new Error(ins.error.message);
  }
}

/** Objectif quotidien courant d'un profil (zone min/max par code de nutriment). */
export interface GoalZone {
  code: string;
  min: number | null;
  max: number | null;
}

/** Lit les objectifs quotidiens (zones) + les nutriments suivis d'un profil. */
export async function getNutritionSettings(
  db: DB,
  profileId: string,
): Promise<{ goals: GoalZone[]; tracked: string[] }> {
  const [goalsRes, trackingRes] = await Promise.all([
    db
      .from('profile_goal')
      .select('target_min, target_max, nutrient_type:nutrient_type_id(code)')
      .eq('profile_id', profileId)
      .eq('period', 'daily'),
    db.from('profile_nutrient_tracking').select('nutrient_type:nutrient_type_id(code)').eq('profile_id', profileId),
  ]);
  const codeOf = (nt: { code: string } | { code: string }[] | null) => (Array.isArray(nt) ? nt[0]?.code : nt?.code);
  const goals = ((unwrap(goalsRes) ?? []) as Array<{
    target_min: number | null;
    target_max: number | null;
    nutrient_type: { code: string } | { code: string }[] | null;
  }>)
    .map((g) => ({ code: codeOf(g.nutrient_type) ?? '', min: g.target_min, max: g.target_max }))
    .filter((g) => g.code);
  const tracked = ((unwrap(trackingRes) ?? []) as Array<{ nutrient_type: { code: string } | { code: string }[] | null }>)
    .map((r) => codeOf(r.nutrient_type) ?? '')
    .filter(Boolean);
  return { goals, tracked };
}
