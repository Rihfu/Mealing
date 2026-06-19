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
 * Fournisseur IA Groq (API compatible OpenAI, palier gratuit).
 * Doc : https://console.groq.com/docs
 *
 * Confiné ici par isolation des fournisseurs (principe n°5). La clé GROQ_API_KEY
 * ne sort jamais de la couche serveur.
 */
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

interface GroqToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}
interface GroqChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string; tool_calls?: GroqToolCall[] } }>;
  error?: { message?: string };
}

/** ToolChatMessage (interne) → message au format API OpenAI/Groq. */
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

  async chatWithTools(
    messages: ToolChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResult> {
    const model = options?.model ?? DEFAULT_MODEL;

    const res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(toApiMessage),
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens,
        tools: tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        tool_choice: 'auto',
      }),
    });

    const data = (await res.json()) as GroqChatResponse;
    if (!res.ok) {
      throw new Error(`Groq a répondu ${res.status} : ${data.error?.message ?? res.statusText}`);
    }

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
};
