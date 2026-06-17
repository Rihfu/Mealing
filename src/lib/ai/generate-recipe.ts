import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';
import type { CreateRecipeInput } from '@/lib/core';

/**
 * Génération de recette assistée par IA (Phase 4, specs §9).
 *
 * Garde-fou non négociable (principe directeur n°3) : l'IA STRUCTURE la recette
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

export interface RecipeGenerationStockItem {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  present?: boolean | null;
  trackingMode?: string | null;
}

export interface IngredientAvailability {
  name: string;
  quantity?: number;
  unit?: string;
  covered: boolean;
}

const SYSTEM_PROMPT = `Tu es un assistant culinaire francophone. À partir de la demande de l'utilisateur, génère UNE recette réaliste et cohérente.

RÈGLE ABSOLUE : ne fournis JAMAIS de valeurs nutritionnelles (calories, protéines, glucides, lipides, fibres, etc.). Elles sont calculées séparément à partir d'une base de données fiable, jamais par toi.

Si un stock disponible est fourni dans la demande, privilégie ces ingrédients. Évite d'ajouter un ingrédient absent sauf s'il est vraiment utile à la recette demandée.

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

function stockContext(items: RecipeGenerationStockItem[] | undefined): string {
  if (!items || items.length === 0) return 'Stock disponible : (aucun stock renseigné)';

  const lines = items
    .filter((item) => item.name.trim())
    .map((item) => {
      const qty = item.quantity != null ? ` ${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : '';
      const status = item.trackingMode === 'presence' ? (item.present ? 'présent' : 'absent') : 'disponible';
      return `- ${item.name}${qty} (${status})`;
    });

  return `Stock disponible à privilégier :\n${lines.join('\n')}`;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('œ', 'oe')
    .replaceAll('Œ', 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '');
}

function isStockItemAvailable(item: RecipeGenerationStockItem): boolean {
  if (item.trackingMode === 'presence') return item.present === true;
  if (item.quantity != null) return item.quantity > 0;
  return item.present !== false;
}

export function analyzeIngredientAvailability(
  draft: RecipeDraft,
  stockItems: RecipeGenerationStockItem[],
): IngredientAvailability[] {
  const availableNames = stockItems
    .filter(isStockItemAvailable)
    .map((item) => normalizeName(item.name))
    .filter((name) => name.length >= 2);

  return draft.ingredients.map((ingredient) => {
    const ingredientName = normalizeName(ingredient.name);
    const covered = availableNames.some(
      (stockName) => ingredientName.includes(stockName) || stockName.includes(ingredientName),
    );

    return {
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      covered,
    };
  });
}

export async function generateRecipeDraft(
  request: string,
  context?: { stockItems?: RecipeGenerationStockItem[] },
): Promise<RecipeDraft> {
  const ai = getAIProvider();
  const res = await ai.chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${stockContext(context?.stockItems)}\n\nDemande utilisateur : ${request}` },
    ],
    { jsonMode: true, temperature: 0.8 },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.content);
  } catch {
    throw new Error("La réponse de l'IA n'est pas un JSON valide.");
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
