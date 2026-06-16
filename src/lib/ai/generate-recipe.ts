import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';
import type { CreateRecipeInput } from '@/lib/core';

/**
 * Génération de recette assistée par IA (Phase 4, specs §9).
 *
 * Garde-fou non-négociable (principe directeur n°3) : l'IA STRUCTURE la recette
 * (nom, ingrédients, quantités, étapes) mais ne produit JAMAIS de valeurs
 * nutritionnelles. Celles-ci restent calculées à partir de la base (food /
 * nutrient_value) quand les ingrédients sont liés à un aliment.
 *
 * La logique de prompt/parse vit ici, AU-DESSUS de la couche fournisseur (n°5) :
 * changer Groq -> Gemini ne touche pas ce fichier.
 */
const draftSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  prepTimeMin: z.number().int().nonnegative().optional(),
  cookTimeMin: z.number().int().nonnegative().optional(),
  servings: z.number().positive().optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().optional(),
        unit: z.string().optional().default(''),
      }),
    )
    .default([]),
  steps: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export type RecipeDraft = z.infer<typeof draftSchema>;

const SYSTEM_PROMPT = `Tu es un assistant culinaire francophone. À partir de la demande de l'utilisateur, génère UNE recette réaliste et cohérente.

RÈGLE ABSOLUE : ne fournis JAMAIS de valeurs nutritionnelles (calories, protéines, glucides, lipides, fibres, etc.). Elles sont calculées séparément à partir d'une base de données fiable, jamais par toi.

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, au format exact :
{
  "name": string,
  "description": string,
  "prepTimeMin": number,
  "cookTimeMin": number,
  "servings": number,
  "ingredients": [{ "name": string, "quantity": number, "unit": string }],
  "steps": [string],
  "tags": [string]
}
Les quantités sont numériques (ex. 200) avec une unité courte ("g", "ml", "c. à soupe", "pièce"). Les étapes sont concises et ordonnées.`;

export async function generateRecipeDraft(request: string): Promise<RecipeDraft> {
  const ai = getAIProvider();
  const res = await ai.chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: request },
    ],
    { jsonMode: true, temperature: 0.8 },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.content);
  } catch {
    throw new Error('La réponse de l’IA n’est pas un JSON valide.');
  }
  return draftSchema.parse(parsed);
}

/** Valide un brouillon reçu (ex. depuis le client) avant enregistrement. */
export function parseDraft(raw: unknown): RecipeDraft {
  return draftSchema.parse(raw);
}

/** Convertit un brouillon IA en entrée pour createRecipe (ingrédients libres). */
export function draftToCreateInput(draft: RecipeDraft): CreateRecipeInput {
  return {
    name: draft.name,
    description: draft.description || undefined,
    instructions: draft.steps.join('\n'),
    prepTimeMin: draft.prepTimeMin,
    cookTimeMin: draft.cookTimeMin,
    servings: draft.servings ?? 1,
    // Ingrédients en texte libre : l'utilisateur pourra les lier à des aliments
    // pour activer le calcul nutritionnel (principe n°3).
    ingredients: draft.ingredients.map((i) => ({
      freeText: i.name,
      quantity: i.quantity,
      unit: i.unit || undefined,
    })),
    tags: draft.tags,
  };
}
