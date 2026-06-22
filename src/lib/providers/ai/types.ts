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

/* ----------------------------- Tool calling ------------------------------ */
/*
 * Function calling (API OpenAI, supporté par Groq) : socle de l'assistant AGENTIQUE.
 * Le modèle peut demander l'exécution d'« outils » (lecture des données) puis, une
 * fois les résultats reçus, répondre ou proposer des outils d'écriture. Le garde-fou
 * de confirmation reste applicatif : les outils d'écriture ne sont jamais exécutés par
 * le fournisseur — ils sont collectés côté agent et confirmés par l'utilisateur.
 */

/** Définition d'un outil exposé au modèle (paramètres = JSON Schema). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Appel d'outil émis par le modèle (`arguments` = JSON brut, à parser/valider). */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** Message enrichi du fil de conversation à outils (format OpenAI). */
export type ToolChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface ToolChatResult {
  /** Texte de réponse (présent quand le modèle ne demande plus d'outil). */
  content: string | null;
  /** Outils demandés par le modèle à ce tour (vide quand il répond). */
  toolCalls: ToolCall[];
  model: string;
}

export interface AIProvider {
  readonly name: string;
  /** Le modèle utilisé par défaut si `options.model` n'est pas fourni. */
  readonly defaultModel: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  /** Tour de conversation avec outils (function calling). Optionnel selon le fournisseur. */
  chatWithTools?(
    messages: ToolChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResult>;
  /**
   * Transcription audio → texte (speech-to-text). Optionnel selon le fournisseur.
   * Garde-fou n°3 inchangé : la transcription structure du langage naturel, elle ne
   * produit jamais une donnée nutritionnelle (la nutrition vient toujours d'USDA/OFF).
   */
  transcribe?(audio: Blob, options?: { language?: string; model?: string }): Promise<{ text: string }>;
}
