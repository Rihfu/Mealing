import { z } from 'zod';
import { getAIProvider } from '@/lib/providers/ai';

/**
 * Conseils INDICATIFS sur un produit (bien le choisir, saisonnalité, sourcing,
 * anti-gaspi). Best-effort, à la demande. Texte d'aide générique — JAMAIS des
 * données vérifiables : aucune valeur nutritionnelle, aucune durée de conservation
 * chiffrée (celles-ci viennent de la base / du fournisseur, garde-fou n°3). En cas
 * d'échec/indispo → renvoie [] (l'appelant n'affiche rien).
 */

const schema = z.object({
  tips: z.array(z.string().min(1)).max(5),
});

const SYSTEM_PROMPT = `Tu donnes de courts conseils pratiques sur un produit alimentaire, pour une appli de courses française.
Renvoie un objet JSON { "tips": string[] } avec 3 à 5 conseils COURTS (une phrase chacun), utiles au consommateur :
comment bien le choisir, la saisonnalité, le sourcing/qualité, ou l'anti-gaspillage.
INTERDIT : aucune valeur chiffrée nutritionnelle (calories, protéines…) ni durée de conservation précise en jours
(ces données viennent d'une base dédiée, pas de toi). Reste général, pratique et prudent.
Réponds UNIQUEMENT avec le JSON, sans texte autour.`;

/** Conseils indicatifs pour un produit. Renvoie [] si l'IA est indisponible / répond mal. */
export async function getProductTips(name: string, category?: string | null): Promise<string[]> {
  const n = name.trim();
  if (!n) return [];
  try {
    const ai = getAIProvider();
    const res = await ai.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Produit : ${n}${category ? ` (rayon : ${category})` : ''}` },
      ],
      { jsonMode: true, temperature: 0.4 },
    );
    return schema.parse(JSON.parse(res.content)).tips.map((t) => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
