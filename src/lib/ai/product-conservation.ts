import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';

/**
 * Estimation de conservation — SOURCE UNIQUE (consolidée 2026-06-20).
 *
 * Un SEUL estimateur : numérique, par lieu (placard/frigo/congelateur), en JOURS, avec une
 * valeur FIXE (pas d'intervalle) non-entamé ET entamé. Utilisé À LA FOIS par le Stock
 * (calcul de la date de péremption) ET par la fiche produit (affichage dérivé des mêmes
 * jours) → plus de divergence entre deux prompts. La valeur fixe est requise pour les
 * futures NOTIFICATIONS de rappel à l'approche de la péremption (besoin d'une date précise,
 * pas d'une fourchette). Indicatif (principe n°2), usages FR. Mis en cache par aliment
 * (table `food_conservation`) → jamais appelé en synchrone au rendu de la liste de stock.
 * Best-effort : renvoie null si l'IA échoue. Ne donne JAMAIS de valeur nutritionnelle (n°3).
 */
const basisDays = z
  .object({ unopened: z.number().nullable(), opened: z.number().nullable() })
  .nullable();
const daysSchema = z.object({
  placard: basisDays.optional(),
  frigo: basisDays.optional(),
  congelateur: basisDays.optional(),
});
export type ConservationDays = z.infer<typeof daysSchema>;

const DAYS_SYSTEM_PROMPT = `Tu estimes la conservation d'un aliment EN NOMBRE DE JOURS, pour une appli FRANÇAISE.
Renvoie un objet JSON { "placard", "frigo", "congelateur" } où CHAQUE lieu vaut { "unopened": number|null, "opened": number|null } :
- Donne une estimation pour les TROIS lieux dès que l'aliment peut Y ÊTRE STOCKÉ, MÊME si la durée est COURTE.
  Un aliment non entamé tient presque toujours un MOMENT au placard (ex. un melon entier au placard ~3 j) → donne le nombre, ne mets PAS null par facilité.
- "unopened" : jours NON ENTAMÉ dans ce lieu (entier, usages FR). "opened" : jours APRÈS ouverture (souvent plus court) ; null si sans objet.
- Mets un lieu à null UNIQUEMENT si le stockage y est absurde ou risqué (ex. yaourt frais au placard, viande crue au placard). Dans le DOUTE, donne un nombre.
Exemples : melon entier placard ~3, frigo ~7 ; banane placard ~5, frigo ~7 (noircit) ; lait UHT placard ~120 (ouvert, frigo ~4) ; saumon frais frigo ~2, congelateur ~180.
INTERDIT : toute valeur nutritionnelle. Réponds UNIQUEMENT avec le JSON.`;

/** Estimation numérique (jours/lieu) pour le Stock. null si l'IA échoue. */
export async function estimateConservationDays(name: string, category?: string | null): Promise<ConservationDays | null> {
  const n = name.trim();
  if (!n) return null;
  try {
    const ai = getAIProvider();
    const res = await ai.chat(
      [
        { role: 'system', content: DAYS_SYSTEM_PROMPT },
        { role: 'user', content: `Aliment : ${n}${category ? ` (rayon : ${category})` : ''}` },
      ],
      { jsonMode: true, temperature: 0.2 },
    );
    return daysSchema.parse(JSON.parse(res.content));
  } catch {
    return null;
  }
}
