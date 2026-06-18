import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';

/**
 * Juge de PLAUSIBILITÉ de valeurs nutritionnelles récupérées chez un fournisseur,
 * pour rejeter les mauvais matchs (ex. « Sel » avec 1333 g de glucides, ou des
 * glucides dans du sel pur). L'IA ne CORRIGE pas et ne GÉNÈRE pas de valeurs —
 * elle répond seulement « cohérent ? oui/non » (garde-fou n°3 : les chiffres
 * viennent toujours du fournisseur). Best-effort : null si l'IA est indisponible.
 */
const schema = z.object({ plausible: z.boolean(), reason: z.string().optional() });

const CODE_LABEL: Record<string, string> = {
  energy_kcal: 'Énergie (kcal)',
  protein: 'Protéines (g)',
  fat: 'Lipides (g)',
  carbs: 'Glucides (g)',
  sugars: 'Sucres (g)',
  fiber: 'Fibres (g)',
  sodium: 'Sodium (mg)',
  iron: 'Fer (mg)',
  calcium: 'Calcium (mg)',
  vitamin_d: 'Vitamine D (µg)',
  vitamin_b12: 'Vitamine B12 (µg)',
};

const SYSTEM_PROMPT = `Tu vérifies la COHÉRENCE de valeurs nutritionnelles (pour 100 g / 100 ml) d'un produit,
récupérées d'une base externe, pour écarter un MAUVAIS appariement.
Sois INDULGENT : accepte des valeurs simplement imparfaites ou approximatives (les données fournisseurs
varient selon la préparation). Mets "plausible": false UNIQUEMENT en cas d'incohérence MANIFESTE pour ce
TYPE d'aliment, par exemple :
- somme des macros (protéines + lipides + glucides) nettement > 100 g ;
- présence notable d'un macro qui ne devrait pas exister (ex. glucides ou protéines dans du sel pur,
  calories dans de l'eau) ;
- profil clairement incompatible avec l'aliment (ex. un légume frais affichant 500 kcal).
En cas de doute, ACCEPTE. Tu NE corriges PAS et n'inventes AUCUNE valeur — tu juges seulement.
Réponds UNIQUEMENT en JSON : { "plausible": boolean, "reason"?: string }`;

export interface NutrientForCheck {
  code: string;
  amount: number;
  unit: string;
}

/** true = cohérent, false = aberrant/incohérent, null = IA indisponible (non concluant). */
export async function isNutritionPlausible(
  productName: string,
  nutrients: NutrientForCheck[],
): Promise<boolean | null> {
  if (nutrients.length === 0) return null;
  const lines = nutrients.map((n) => `- ${CODE_LABEL[n.code] ?? n.code} : ${n.amount} ${n.unit}`).join('\n');
  try {
    const ai = getAIProvider();
    const res = await ai.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Produit : ${productName}\nValeurs pour 100 g / 100 ml :\n${lines}` },
      ],
      { jsonMode: true, temperature: 0 },
    );
    return schema.parse(JSON.parse(res.content)).plausible;
  } catch {
    return null;
  }
}
