'use client';

import { useState } from 'react';
import { askAgentAction, clearConversationAction, executeAgentAction } from './actions';
import type { AgentProposal } from '@/lib/ai/agent';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export function AgentChat({ initial }: { initial: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    setProposal(null);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setPending(true);
    try {
      const d = await askAgentAction(text);
      if (d.type === 'reply') {
        setMessages((m) => [...m, { role: 'assistant', content: d.message }]);
      } else {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: `💡 Proposition : ${d.proposal.summary} (à confirmer)` },
        ]);
        setProposal(d.proposal);
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Une erreur est survenue.' }]);
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!proposal || pending) return;
    const action = proposal.action;
    setProposal(null);
    setPending(true);
    try {
      const r = await executeAgentAction(action);
      setMessages((m) => [...m, { role: 'assistant', content: `✅ ${r.message}` }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: "Échec de l'exécution." }]);
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setMessages((m) => [...m, { role: 'assistant', content: '❌ Action annulée.' }]);
    setProposal(null);
  }

  async function clearAll() {
    await clearConversationAction();
    setMessages([]);
    setProposal(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Assistant</h1>
        {messages.length > 0 && (
          <button onClick={clearAll} className="text-xs text-ink-soft underline">
            Effacer la conversation
          </button>
        )}
      </div>
      <p className="text-sm text-ink-soft">
        Demandez une info, ou une action (planifier un repas, ajouter au stock ou aux courses,
        marquer une journée hors-plan). Toute modification vous est proposée et n’est exécutée
        qu’après votre confirmation.
      </p>

      <div className="flex flex-col gap-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'self-end bg-green-strong text-white dark:bg-white dark:text-black'
                : 'self-start bg-sage-tint dark:bg-gray-800'
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-ink-soft">
            Ex. « Ajoute du lait à ma liste de courses » ou « Planifie une omelette demain midi ».
          </p>
        )}
      </div>

      {proposal && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-medium">Confirmer cette action ?</p>
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{proposal.summary}</p>
          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={pending}
              className="rounded bg-green-strong px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              Confirmer
            </button>
            <button onClick={cancel} disabled={pending} className="rounded border border-line-strong px-3 py-1.5 text-sm dark:border-gray-700">
              Annuler
            </button>
          </div>
        </div>
      )}

      <form onSubmit={send} className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="Votre message…"
          className="flex-1 rounded border border-line-strong px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded bg-green-strong px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? '…' : 'Envoyer'}
        </button>
      </form>
    </div>
  );
}
