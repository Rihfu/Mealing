import { serverEnv } from '@/lib/env.server';
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ToolCall,
  ToolChatMessage,
  ToolChatResult,
  ToolDefinition,
} from './types';

/**
 * Fournisseur IA OpenAI — modèle `gpt-5-mini` par défaut (bon rapport fiabilité
 * tool-calling / prix pour notre agent input-heavy ; cf. mémoire `ai-provider-strategy`).
 * API Chat Completions, format identique à Groq → bascule = ce seul module (principe n°5).
 * La clé OPENAI_API_KEY ne sort jamais de la couche serveur.
 *
 * ⚠️ Spécificités des modèles GPT-5 (≠ Groq/Llama) gérées ici :
 * - `max_completion_tokens` au lieu de `max_tokens` ;
 * - `temperature` NON supportée (modèles de raisonnement) → jamais envoyée ;
 * - `reasoning_effort: 'low'` → on limite le raisonnement (nos tâches sont simples :
 *   classif/JSON/traduction + agent CRUD), ce qui réduit coût et latence.
 */
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'gpt-5-mini';
/** STT : successeur de Whisper (meilleure WER au même prix). Cf. mémoire/recherche juin 2026. */
const TRANSCRIBE_MODEL = 'gpt-4o-transcribe';
const REASONING_EFFORT = 'low';
/** Plancher de tokens de sortie : un modèle de raisonnement consomme des tokens de
 *  raisonnement AVANT la réponse → un plafond trop bas renverrait un contenu vide. */
const MIN_COMPLETION_TOKENS = 2048;

interface OpenAIToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}
interface OpenAIChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string; tool_calls?: OpenAIToolCall[] } }>;
  error?: { message?: string };
}

/** Convertit `maxTokens` (cap demandé) en `max_completion_tokens` avec marge de raisonnement. */
function completionTokens(maxTokens?: number): number | undefined {
  if (maxTokens == null) return undefined; // défaut OpenAI (généreux) → laisse de la marge
  return Math.max(maxTokens, MIN_COMPLETION_TOKENS);
}

/** ToolChatMessage (interne) → message au format API OpenAI. */
function toApiMessage(m: ToolChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
  if (m.role === 'assistant') {
    return {
      role: 'assistant',
      content: m.content,
      ...(m.toolCalls && m.toolCalls.length > 0
        ? {
            tool_calls: m.toolCalls.map((t) => ({
              id: t.id,
              type: 'function',
              function: { name: t.name, arguments: t.arguments },
            })),
          }
        : {}),
    };
  }
  return { role: m.role, content: m.content };
}

async function postChat(body: Record<string, unknown>): Promise<OpenAIChatResponse> {
  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as OpenAIChatResponse;
  if (!res.ok) {
    throw new Error(`OpenAI a répondu ${res.status} : ${data.error?.message ?? res.statusText}`);
  }
  return data;
}

export const openaiProvider: AIProvider = {
  name: 'openai',
  defaultModel: DEFAULT_MODEL,

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const model = options?.model ?? DEFAULT_MODEL;
    // NB : `temperature` volontairement omise (non supportée par les modèles GPT-5).
    const data = await postChat({
      model,
      messages,
      max_completion_tokens: completionTokens(options?.maxTokens),
      reasoning_effort: REASONING_EFFORT,
      response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
    });
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      model: data.model ?? model,
    };
  },

  async chatWithTools(
    messages: ToolChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResult> {
    const model = options?.model ?? DEFAULT_MODEL;
    const data = await postChat({
      model,
      messages: messages.map(toApiMessage),
      max_completion_tokens: completionTokens(options?.maxTokens),
      reasoning_effort: REASONING_EFFORT,
      tools: tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      tool_choice: 'auto',
    });

    const msg = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? [])
      .filter((t) => t.function?.name)
      .map((t, i) => ({
        id: t.id ?? `call_${i}`,
        name: t.function!.name as string,
        arguments: t.function?.arguments ?? '{}',
      }));

    return {
      content: msg?.content ?? null,
      toolCalls,
      model: data.model ?? model,
    };
  },

  async transcribe(audio: Blob, options?: { language?: string; model?: string }): Promise<{ text: string }> {
    // Multipart (≠ JSON) : on laisse fetch poser le Content-Type/boundary lui-même.
    const form = new FormData();
    const filename = (audio as File).name || 'audio.webm';
    form.append('file', audio, filename);
    form.append('model', options?.model ?? TRANSCRIBE_MODEL);
    if (options?.language) form.append('language', options.language);
    form.append('response_format', 'json');
    const res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}` },
      body: form,
    });
    const data = (await res.json()) as { text?: string; error?: { message?: string } };
    if (!res.ok) {
      throw new Error(`OpenAI transcription a répondu ${res.status} : ${data.error?.message ?? res.statusText}`);
    }
    return { text: data.text ?? '' };
  },
};
