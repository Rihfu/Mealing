import { groqProvider } from './groq';
import type { AIProvider } from './types';

export * from './types';
export { groqProvider } from './groq';

/**
 * Fournisseur IA actif. Point de bascule unique pour changer de fournisseur
 * (ex. Groq -> Gemini) sans toucher au reste du code (principe n°5).
 */
export function getAIProvider(): AIProvider {
  return groqProvider;
}
