/**
 * Interface commune des fournisseurs d'IA (LLM cloud à palier gratuit).
 *
 * Décision verrouillée (specs §8) : API cloud (Groq ou Gemini), JAMAIS d'hébergement
 * local type Ollama. Toute la logique applicative dépend de cette interface, jamais
 * d'un fournisseur concret (principe n°5) : passer de Groq à Gemini = un seul module.
 *
 * Garde-fou (principe n°3) : l'IA interprète/structure/met en correspondance du
 * langage naturel, mais ne produit JAMAIS une donnée nutritionnelle vérifiable.
 * Les chiffres viennent toujours des fournisseurs nutritionnels, pas du LLM.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Force une réponse JSON valide (le prompt doit mentionner « JSON »). */
  jsonMode?: boolean;
}

export interface ChatResult {
  content: string;
  model: string;
}

export interface AIProvider {
  readonly name: string;
  /** Le modèle utilisé par défaut si `options.model` n'est pas fourni. */
  readonly defaultModel: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
}
