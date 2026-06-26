import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';

/**
 * Adapte une recette à un nombre de portions DIFFÉRENT, par jugement culinaire.
 *
 * Pourquoi l'IA et pas une simple multiplication : le scaling culinaire n'est PAS
 * toujours linéaire — sel, épices, levure, matières grasses et liquides
 * d'assaisonnement s'augmentent sous-proportionnellement, et les temps de
 * prépa/cuisson ne se multiplient pas par le ratio (même four/poêle). L'IA applique
 * ce jugement. Décision utilisateur (2026-06-26).
 *
 * Garde-fou n°3 : on n'invente AUCUNE valeur nutritionnelle ici — uniquement des
 * quantités d'ingrédients et des temps (estimation culinaire, principe n°2). La
 * nutrition reste calculée depuis la recette de base (et « par portion » =
 * invariante au scaling). Best-effort : en cas d'échec/indispo → renvoie null
 * (l'appelant retombe sur un scaling linéaire).
 *
 * Logique au-dessus de la couche fournisseur (n°5) : passe par `getAIProvider`.
 */

export interface ScalableIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface ScaleRecipeInput {
  name: string;
  baseServings: number;
  targetServings: number;
  ingredients: ScalableIngredient[];
  prepTimeMin: number | null;
  cookTimeMin: number | null;
}

export interface ScaledRecipeResult {
  /** Quantités scalées, dans le MÊME ORDRE que les ingrédients d'entrée. */
  quantities: Array<number | null>;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  /** Courte remarque sur les ajustements non-évidents, ou null. */
  note: string | null;
}

const schema = z.object({
  ingredients: z.array(
    z.object({
      name: z.string().optional(),
      quantity: z.number().nullable().catch(null),
    }),
  ),
  prep_time_min: z.number().nonnegative().nullable().catch(null),
  cook_time_min: z.number().nonnegative().nullable().catch(null),
  note: z.string().nullable().catch(null),
});

const SYSTEM_PROMPT = `Tu es un chef qui adapte une recette à un nouveau nombre de portions, dans une appli française.
On te donne une recette (portions de base, ingrédients avec quantité+unité, temps de prépa et de cuisson) et un nombre de portions CIBLE.
Renvoie UNIQUEMENT un objet JSON : { "ingredients": [ { "name", "quantity" } ], "prep_time_min", "cook_time_min", "note" }.

Règles :
- Garde EXACTEMENT le même nombre d'ingrédients, dans le MÊME ORDRE, avec le même "name". Ne change que "quantity".
- La plupart des ingrédients se multiplient proportionnellement (quantité × portions_cible / portions_base).
- MAIS applique ton jugement culinaire pour ceux qui ne montent PAS linéairement : sel, épices, herbes, aromates, levure/bicarbonate, matières grasses de cuisson, liquides d'assaisonnement → augmente-les SOUS-proportionnellement (on sale moins fort en grande quantité). Donne des quantités réalistes, arrondies de façon pratique.
- Si une quantité d'entrée est null (non chiffrée), laisse "quantity" à null.
- "prep_time_min" / "cook_time_min" : adapte de façon RÉALISTE et NON linéaire. Plus de portions = un peu plus de préparation (découpe), mais la cuisson change peu (même four/poêle) ou modérément. Ne multiplie JAMAIS les temps par le ratio. Renvoie des entiers (minutes), ou null si l'entrée était null.
- "note" : une phrase TRÈS courte en français sur les ajustements non-évidents (ex. « sel et épices ajustés, cuisson un peu allongée »), ou null si rien de notable.
Réponds UNIQUEMENT avec l'objet JSON.`;

/** Adapte une recette à `targetServings`. Renvoie null si l'IA est indisponible/répond mal. */
export async function scaleRecipeForServings(input: ScaleRecipeInput): Promise<ScaledRecipeResult | null> {
  if (input.targetServings <= 0 || input.baseServings <= 0) return null;
  if (input.ingredients.length === 0) return null;
  try {
    const ai = getAIProvider();
    const payload = {
      recette: input.name,
      portions_base: input.baseServings,
      portions_cible: input.targetServings,
      ingredients: input.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      prep_time_min: input.prepTimeMin,
      cook_time_min: input.cookTimeMin,
    };
    const res = await ai.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      { jsonMode: true, temperature: 0 },
    );
    const parsed = schema.parse(JSON.parse(res.content));

    // Map par ORDRE (on ne fait confiance qu'à la position, pas au nom renvoyé).
    const quantities = input.ingredients.map((ing, idx) => {
      if (ing.quantity == null) return null; // entrée non chiffrée → reste non chiffrée
      const q = parsed.ingredients[idx]?.quantity;
      return q != null && q >= 0 ? q : ing.quantity; // repli sur la valeur de base si manquante
    });

    return {
      quantities,
      prepTimeMin: parsed.prep_time_min != null ? Math.round(parsed.prep_time_min) : input.prepTimeMin,
      cookTimeMin: parsed.cook_time_min != null ? Math.round(parsed.cook_time_min) : input.cookTimeMin,
      note: parsed.note?.trim() || null,
    };
  } catch {
    return null;
  }
}
