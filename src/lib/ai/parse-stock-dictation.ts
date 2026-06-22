import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';
import { UNIT_OPTIONS } from '@/lib/units';

/**
 * Découpe une DICTÉE de stock (transcription d'une personne énumérant ce qu'elle a chez
 * elle) en une liste d'articles structurés : nature générique FR + quantité + unité + lieu.
 *
 * Garde-fou n°3 : on structure du langage naturel, on ne produit AUCUNE donnée
 * nutritionnelle (les chiffres viennent toujours d'USDA/OFF). Best-effort : en cas
 * d'échec/indispo/JSON invalide → renvoie [] (l'utilisateur saisira manuellement).
 *
 * Logique au-dessus de la couche fournisseur (n°5) : l'appel passe par `getAIProvider`.
 */

const UNIT_CODES = UNIT_OPTIONS.map((u) => u.code);
const LOCATION_KEYS = ['placard', 'frigo', 'congelateur', 'cave', 'corbeille'] as const;

export interface DictatedItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  location: string | null;
}

const itemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().nullable().catch(null),
  unit: z.string().nullable().catch(null),
  location: z.string().nullable().catch(null),
});
const schema = z.object({ items: z.array(itemSchema).catch([]) });

const SYSTEM_PROMPT = `Tu aides à recenser le stock alimentaire d'un foyer dans une appli française.
On te donne la TRANSCRIPTION d'une personne qui énumère à voix haute ce qu'elle a chez elle.
Découpe-la en une liste d'articles. Renvoie UNIQUEMENT un objet JSON : { "items": [ { "name", "quantity", "unit", "location" } ] }.
- "name" : la NATURE générique de l'aliment, EN FRANÇAIS, sans marque ni détail superflu
  (ex. « yaourt à la vanille », « pommes », « blanc de poulet », « farine »).
- "quantity" : le nombre si énoncé (« deux litres » -> 2 ; « une douzaine d'œufs » -> 12 ; « un paquet de pâtes » -> 1), sinon null.
- "unit" : STRICTEMENT l'un de ces codes si pertinent, sinon null : ${UNIT_CODES.join(', ')}.
- "location" : le lieu SEULEMENT s'il est explicitement énoncé, STRICTEMENT l'une de ces clés sinon null :
  placard, frigo, congelateur, cave, corbeille.
Un article par aliment cité ; ignore les mots de liaison. Réponds UNIQUEMENT avec l'objet JSON.`;

/** Parse une dictée en articles. Renvoie [] si l'IA est indisponible ou répond mal. */
export async function parseStockDictation(transcript: string): Promise<DictatedItem[]> {
  const t = transcript.trim();
  if (!t) return [];
  try {
    const ai = getAIProvider();
    const res = await ai.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Transcription : ${t}` },
      ],
      { jsonMode: true, temperature: 0 },
    );
    const parsed = schema.parse(JSON.parse(res.content));
    return parsed.items
      .map((it) => ({
        name: it.name.trim(),
        quantity: it.quantity != null && it.quantity > 0 ? it.quantity : null,
        unit: it.unit && UNIT_CODES.includes(it.unit) ? it.unit : null,
        location: it.location && (LOCATION_KEYS as readonly string[]).includes(it.location) ? it.location : null,
      }))
      .filter((it) => it.name.length > 0);
  } catch {
    return [];
  }
}
