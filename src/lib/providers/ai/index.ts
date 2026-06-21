import { openaiProvider } from './openai';
import type { AIProvider } from './types';

export * from './types';
export { groqProvider } from './groq';
export { openaiProvider } from './openai';

/**
 * Fournisseur IA actif. Point de bascule unique pour changer de fournisseur
 * sans toucher au reste du code (principe n°5).
 *
 * Actif : OpenAI `gpt-5-mini` (décision 2026-06-21 — meilleur tool-calling / prix
 * pour notre agent input-heavy). Groq reste disponible en repli (`groqProvider`) ;
 * Mistral Small 3.1 = réserve UE/RGPD pour la phase commercialisation.
 */
export function getAIProvider(): AIProvider {
  return openaiProvider;
}
