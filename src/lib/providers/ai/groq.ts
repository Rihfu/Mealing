import { serverEnv } from '@/lib/env.server';
import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from './types';

/**
 * Fournisseur IA Groq (API compatible OpenAI, palier gratuit).
 * Doc : https://console.groq.com/docs
 *
 * Confiné ici par isolation des fournisseurs (principe n°5). La clé GROQ_API_KEY
 * ne sort jamais de la couche serveur.
 */
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

interface GroqChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export const groqProvider: AIProvider = {
  name: 'groq',
  defaultModel: DEFAULT_MODEL,

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const model = options?.model ?? DEFAULT_MODEL;

    const res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
      }),
    });

    const data = (await res.json()) as GroqChatResponse;

    if (!res.ok) {
      throw new Error(`Groq a répondu ${res.status} : ${data.error?.message ?? res.statusText}`);
    }

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      model: data.model ?? model,
    };
  },
};
