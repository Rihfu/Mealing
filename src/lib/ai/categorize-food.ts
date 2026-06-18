import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';

/**
 * Classement IA d'un aliment importé (USDA/Open Food Facts) à l'ajout :
 *   - un nom GÉNÉRIQUE et court en français (sans marque ni détails superflus) ;
 *   - un rayon issu d'une LISTE FERMÉE (les rayons intégrés).
 *
 * Garde-fou n°3 : ni le nom ni le rayon ne sont des données nutritionnelles
 * vérifiables — les chiffres viennent TOUJOURS du fournisseur, jamais du LLM.
 * Best-effort : en cas d'échec/indispo/JSON invalide → renvoie null (l'appelant
 * garde alors le nom du fournisseur et un rayon vide « Autres »).
 *
 * Logique au-dessus de la couche fournisseur (n°5) : Groq → Gemini ne touche rien ici.
 */

// Doit rester synchrone avec les clés de rayon (product-assets / migration 0011).
const schema = z.object({
  name: z.string().min(1),
  category: z
    .enum(['legumes', 'proteines', 'cremerie', 'boulangerie', 'epicerie', 'sucre', 'surgeles', 'boissons', 'maison'])
    .nullable()
    .catch(null),
});

export interface FoodClassification {
  name: string;
  category: string | null;
}

const SYSTEM_PROMPT = `Tu ranges un produit alimentaire dans une appli de courses française.
On te donne le nom BRUT d'un produit (souvent en anglais, avec marque et précisions superflues de conditionnement/préparation).

Renvoie un objet JSON :
- "name" : le nom GÉNÉRIQUE et COURT du produit, EN FRANÇAIS, sans marque ni détails superflus.
  Exemples : "Cheese, parmesan, grated, refrigerated" -> "Parmesan" ; "Bananas, raw" -> "Banane" ;
  "Coca-Cola Original Taste 1.5L" -> "Soda" ; "Chicken breast, boneless, skinless" -> "Blanc de poulet".
- "category" : le rayon, STRICTEMENT l'une de ces clés (sinon null) :
  legumes (fruits & légumes), proteines (viandes, poissons & œufs), cremerie (frais & crémerie),
  boulangerie (pains & céréales), epicerie (épicerie salée, conserves, épices, féculents),
  sucre (petit-déj & sucré), boissons, surgeles, maison (entretien & hygiène).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour : { "name": string, "category": string|null }`;

/** Classe un aliment importé. Renvoie null si l'IA est indisponible ou répond mal. */
export async function classifyImportedFood(rawName: string): Promise<FoodClassification | null> {
  const raw = rawName.trim();
  if (!raw) return null;
  try {
    const ai = getAIProvider();
    const res = await ai.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Produit : ${raw}` },
      ],
      { jsonMode: true, temperature: 0 },
    );
    const parsed = schema.parse(JSON.parse(res.content));
    const name = parsed.name.trim();
    return { name: name || raw, category: parsed.category ?? null };
  } catch {
    return null;
  }
}
