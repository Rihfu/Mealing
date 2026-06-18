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
