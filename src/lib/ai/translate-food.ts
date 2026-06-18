import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';

/**
 * Traduit un nom d'aliment FR → terme générique EN, UNIQUEMENT pour rechercher sa
 * fiche chez un fournisseur nutritionnel anglophone (USDA). Ne touche JAMAIS aux
 * valeurs nutritionnelles (qui viennent du fournisseur, garde-fou n°3) — c'est juste
 * un terme de recherche. Best-effort : renvoie '' si l'IA échoue (repli sur le nom FR).
 */
const schema = z.object({ term: z.string().min(1) });

const SYSTEM_PROMPT = `Traduis un nom d'aliment français en UN terme générique anglais simple, adapté à la recherche
dans une base nutritionnelle (USDA FoodData Central). Donne le terme le plus générique (aliment brut).
Exemples : « Œufs » -> "egg" ; « Poireau » -> "leek" ; « Lait demi-écrémé » -> "milk" ;
« Blanc de poulet » -> "chicken breast" ; « Pâtes » -> "pasta".
Réponds UNIQUEMENT en JSON : { "term": string }`;

/** Terme de recherche EN pour un aliment FR. Renvoie '' si indisponible. */
export async function toEnglishFoodTerm(name: string): Promise<string> {
  const n = name.trim();
  if (!n) return '';
  try {
    const ai = getAIProvider();
    const res = await ai.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Aliment : ${n}` },
      ],
      { jsonMode: true, temperature: 0 },
    );
    return schema.parse(JSON.parse(res.content)).term.trim();
  } catch {
    return '';
  }
}
