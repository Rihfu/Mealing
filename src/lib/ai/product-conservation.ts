import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';

/**
 * Estimation INDICATIVE des durées de conservation d'un aliment, PAR LIEU de stockage,
 * adaptée aux usages français (ex. œufs hors frigo, poireau au bac à légumes). Validé
 * avec l'utilisateur : ces repères sont communs et l'IA les estime correctement ;
 * ils restent **indicatifs** (l'utilisateur garde le dernier mot). Ne donne JAMAIS de
 * valeurs nutritionnelles. Best-effort : renvoie [] si l'IA échoue.
 */
const schema = z.object({
  options: z
    .array(
      z.object({
        storage: z.enum(['placard', 'frigo', 'congelateur']),
        duration: z.string().min(1), // durée en clair, ex. « 1 à 2 semaines »
        note: z.string().optional(),
      }),
    )
    .max(3),
});

export interface ConservationEstimate {
  storage: 'placard' | 'frigo' | 'congelateur';
  duration: string;
  note?: string;
}

const SYSTEM_PROMPT = `Tu estimes la conservation d'un aliment pour une appli de courses FRANÇAISE.
Renvoie un objet JSON { "options": [{ "storage", "duration", "note"? }] } avec 1 à 3 lieux de stockage PERTINENTS
pour cet aliment (n'invente pas un stockage absurde) :
- "storage" : strictement "placard" | "frigo" | "congelateur".
- "duration" : durée INDICATIVE en clair et en français (ex. « 2 à 3 jours », « environ 1 semaine », « plusieurs mois »),
  selon les usages FRANÇAIS (ex. œufs : placard OK en France ; poireau : au frigo, pas au placard).
- "note" (optionnel) : courte précision pratique (ex. « bac à légumes », « après ouverture : au frigo »).
Ordre du plus pertinent au moins pertinent. INTERDIT : toute valeur nutritionnelle.
Réponds UNIQUEMENT avec le JSON.`;

/** Repères de conservation (par stockage) pour un produit. [] si indisponible. */
export async function getProductConservation(name: string, category?: string | null): Promise<ConservationEstimate[]> {
  const n = name.trim();
  if (!n) return [];
  try {
    const ai = getAIProvider();
    const res = await ai.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Aliment : ${n}${category ? ` (rayon : ${category})` : ''}` },
      ],
      { jsonMode: true, temperature: 0.2 },
    );
    return schema.parse(JSON.parse(res.content)).options;
  } catch {
    return [];
  }
}

/* -------------------- Conservation en JOURS (pour le Stock) ------------------ */
/*
 * Variante NUMÉRIQUE de l'estimation, pour CALCULER une date de péremption dans le
 * Stock (la version `getProductConservation` ci-dessus renvoie du texte, pour l'affichage
 * de la fiche). Par lieu (placard/frigo/congelateur), durée en JOURS, non-entamé ET
 * entamé. Indicatif (principe n°2), usages FR. Mis en cache par aliment (table
 * `food_conservation`) → jamais appelé en synchrone au rendu de la liste de stock.
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
Renvoie un objet JSON { "placard"?, "frigo"?, "congelateur"? } où chaque lieu PERTINENT vaut { "unopened": number|null, "opened": number|null } :
- "unopened" : jours de conservation NON ENTAMÉ dans ce lieu (entier, usages FR).
- "opened" : jours APRÈS ouverture/entame dans ce lieu (souvent plus court) ; null si sans objet.
- Omets un lieu (ou mets-le à null) s'il n'est pas pertinent (ex. pas de congélateur pour des œufs frais).
Exemples d'ordre de grandeur : lait UHT placard ~120 (ouvert au frigo ~4) ; saumon frais frigo ~2 ; surgelés congelateur ~180.
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
