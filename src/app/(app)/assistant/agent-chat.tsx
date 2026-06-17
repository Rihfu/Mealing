'use client';

import { useState } from 'react';
import { askAgentAction, clearConversationAction, executeAgentAction } from './actions';
import type { AgentProposal } from '@/lib/ai/agent';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentContext {
  meals: Array<{ slot: string; name: string }>;
  urgentStock: Array<{ name: string; label: string; tone: string }>;
  energy: number;
  sodium: number;
}

export function AgentChat({ initial, context }: { initial: Msg[]; context?: AgentContext }) {
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
        setMessages((m) => [...m, { role: 'assistant', content: d.proposal.summary }]);
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
      setMessages((m) => [...m, { role: 'assistant', content: `✓ Fait. ${r.message}` }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: "Échec de l'exécution." }]);
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setMessages((m) => [...m, { role: 'assistant', content: 'Action annulée.' }]);
    setProposal(null);
  }

  async function clearAll() {
    await clearConversationAction();
    setMessages([]);
    setProposal(null);
  }

  function pick(text: string) {
    setInput(text);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,760px)_280px] lg:items-start lg:justify-center">
      <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Assistant</h1>
          <p className="mt-0.5 text-xs text-ink-soft">Contexte : repas de la semaine · stock · macros du jour</p>
        </div>
        {messages.length > 0 && (
          <button onClick={clearAll} className="text-xs text-ink-soft hover:underline">
            Effacer
          </button>
        )}
      </div>

      <div className="flex min-h-[40vh] flex-col gap-3 lg:min-h-[56vh]">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'max-w-[82%] self-end rounded-2xl rounded-br-sm bg-green px-3.5 py-2.5 text-sm text-white'
                : 'max-w-[84%] self-start rounded-2xl rounded-bl-sm bg-sage-tint px-3.5 py-2.5 text-sm text-ink'
            }
          >
            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
          </div>
        ))}

        {proposal && (
          <div className="w-[88%] self-start rounded-2xl border border-orange bg-[#fdf0e3] p-3.5 shadow-soft">
            <div className="mb-2 flex items-center gap-1.5 text-orange">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
              <span className="font-display text-sm font-semibold text-ink">Confirmer cette action ?</span>
            </div>
            <div className="mb-3 rounded-xl border border-line bg-surface p-2.5 text-xs">
              <div className="font-semibold text-ink">{proposal.summary}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={confirm} disabled={pending} className="btn-primary flex-1 py-2.5 disabled:opacity-50">
                Confirmer
              </button>
              <button onClick={cancel} disabled={pending} className="btn-secondary px-4 py-2.5">
                Annuler
              </button>
            </div>
          </div>
        )}

        {messages.length === 0 && !proposal && (
          <p className="text-sm text-ink-soft">
            Pose une question, ou demande une action — tout est confirmé avant d’être appliqué.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 pb-3 pt-2 lg:static lg:mx-0 lg:rounded-2xl lg:border lg:shadow-soft">
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {['Qu’est-ce qu’on mange ?', 'Planifie une omelette demain midi'].map((s) => (
            <button key={s} type="button" onClick={() => pick(s)} className="nav-pill bg-sage-tint text-sage-deep">
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={send} className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Écris à l’assistant…"
            className="flex-1 rounded-full border border-line bg-paper px-4 py-2.5 text-sm focus:outline-2 focus:outline-green"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            aria-label="Envoyer"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-green-strong text-white disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </form>
      </div>
      </div>

      <aside className="hidden flex-col gap-4 lg:flex">
        <div className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">Contexte</div>
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="mb-3 font-display text-base font-semibold">Repas du jour</h2>
          <div className="flex flex-col gap-2">
            {(context?.meals.length ? context.meals : [{ slot: 'Aujourdâ€™hui', name: 'Aucun repas planifiÃ©' }]).map(
              (meal, index) => (
                <div key={`${meal.slot}-${index}`} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-sage" />
                  <span>
                    <span className="text-ink-soft">{meal.slot}</span>
                    <br />
                    <span className="font-semibold">{meal.name}</span>
                  </span>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="mb-3 font-display text-base font-semibold">Stock urgent</h2>
          <div className="flex flex-col gap-2">
            {(context?.urgentStock.length ? context.urgentStock : [{ name: 'Rien Ã  signaler', label: 'frais', tone: 'ok' }]).map(
              (item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{item.name}</span>
                  <span className={`pill ${item.tone === 'danger' ? 'bg-red text-white' : item.tone === 'warn' ? 'bg-orange text-white' : 'bg-sage-tint text-green-strong'}`}>
                    {item.label}
                  </span>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-sage bg-sage-tint p-4">
          <h2 className="mb-3 font-display text-base font-semibold">Macros du jour</h2>
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-ink-soft">Ã‰nergie</span>
            <span className="font-bold">{context?.energy ?? 0} kcal</span>
          </div>
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-ink-soft">Sodium</span>
            <span className="font-bold text-red-strong">{context?.sodium ?? 0} mg</span>
          </div>
        </section>
      </aside>
    </div>
  );
}
