'use client';

import { useEffect, useRef, useState } from 'react';
import {
  askAgentAction,
  executeAgentAction,
  listConversationsAction,
  createConversationAction,
  deleteConversationAction,
  renameConversationAction,
  getConversationAction,
  startNewConversationWithBriefAction,
} from './actions';
import type { ProposedAction } from '@/lib/ai/agent';
import { TrashIcon } from '../courses/shopping-list';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

interface ConvItem {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

interface AgentContext {
  meals: Array<{ slot: string; name: string }>;
  urgentStock: Array<{ name: string; label: string; tone: string }>;
  energy: number;
  sodium: number;
}

function relDate(iso: string): string {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'auj.';
  if (d === 1) return 'hier';
  if (d < 7) return `${d} j`;
  return `${Math.round(d / 7)} sem`;
}

export function AgentChat({
  initial,
  conversationId: initialConvId,
  conversations: initialConvs,
  limit,
  context,
}: {
  initial: Msg[];
  conversationId: string;
  conversations: ConvItem[];
  limit: number;
  context?: AgentContext;
}) {
  const [conversationId, setConversationId] = useState(initialConvId);
  const [conversations, setConversations] = useState<ConvItem[]>(initialConvs);
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [plan, setPlan] = useState<ProposedAction[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function closeMenu() {
    setMenuOpen(false);
    setEditingId(null);
  }

  // Défile vers le dernier message à chaque nouveau message / plan / état d'attente.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, plan, pending]);

  // Ferme le menu des conversations au clic extérieur.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [menuOpen]);

  const count = messages.length;
  const ratio = limit > 0 ? count / limit : 0;
  const limitReached = count >= limit;
  const current = conversations.find((c) => c.id === conversationId);
  const currentTitle = current?.title || (conversationId ? 'Conversation' : 'Nouvelle conversation');

  async function refreshList() {
    setConversations(await listConversationsAction());
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    setPlan(null);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setPending(true);
    try {
      const d = await askAgentAction(text, conversationId || undefined);
      if (d.conversationId && d.conversationId !== conversationId) setConversationId(d.conversationId);
      setMessages((m) => [...m, { role: 'assistant', content: d.result.message }]);
      if (d.result.type === 'plan' && d.result.actions.length > 0) setPlan(d.result.actions);
      void refreshList();
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Une erreur est survenue.' }]);
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!plan || pending) return;
    const actions = plan;
    setPlan(null);
    setPending(true);
    try {
      const r = await executeAgentAction(actions, conversationId || undefined);
      setMessages((m) => [...m, { role: 'assistant', content: `✓ Fait. ${r.messages.join(' ')}` }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: "Échec de l'exécution." }]);
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setMessages((m) => [...m, { role: 'assistant', content: 'Action annulée.' }]);
    setPlan(null);
  }

  async function newConversation() {
    closeMenu();
    const r = await createConversationAction();
    if (!r) return;
    setConversationId(r.id);
    setMessages([]);
    setPlan(null);
    void refreshList();
  }

  async function loadConversation(id: string) {
    setPending(true);
    try {
      const d = await getConversationAction(id);
      setConversationId(id);
      setMessages(d.messages);
      setPlan(null);
    } finally {
      setPending(false);
    }
  }

  function switchTo(id: string) {
    closeMenu();
    if (id !== conversationId) void loadConversation(id);
  }

  async function removeConversation(id: string) {
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    await deleteConversationAction(id);
    if (id === conversationId) {
      const next = remaining[0];
      if (next) await loadConversation(next.id);
      else {
        setConversationId('');
        setMessages([]);
        setPlan(null);
      }
    }
    void refreshList();
  }

  function startRename(c: ConvItem) {
    setEditingId(c.id);
    setEditTitle(c.title || '');
  }

  async function saveRename(id: string) {
    const t = editTitle.trim();
    setEditingId(null);
    if (!t) return;
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title: t } : c)));
    await renameConversationAction(id, t);
  }

  // #4 : au seuil, ouvre une nouvelle conversation amorcée par un brief de l'ancienne.
  async function continueInNew() {
    if (!conversationId || pending) return;
    setPending(true);
    try {
      const r = await startNewConversationWithBriefAction(conversationId);
      if (r) {
        setConversationId(r.id);
        setMessages(r.messages);
        setPlan(null);
        void refreshList();
      }
    } finally {
      setPending(false);
    }
  }

  function pick(text: string) {
    setInput(text);
  }

  // Liste déroulante des conversations (réutilisée dans la barre d'outils, ouverte vers le haut).
  const conversationMenu = (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (menuOpen) closeMenu();
          else {
            setMenuOpen(true);
            void refreshList();
          }
        }}
        className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-green-strong hover:text-green-strong"
      >
        Conversations
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {menuOpen && (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-soft">
          <button
            type="button"
            onClick={newConversation}
            className="mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-green-strong hover:bg-sage-tint/50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Nouvelle conversation
          </button>
          <ul className="max-h-72 overflow-auto">
            {conversations.length === 0 && (
              <li className="px-2.5 py-2 text-xs text-ink-soft">Aucune conversation pour l’instant.</li>
            )}
            {conversations.map((c) => (
              <li
                key={c.id}
                className={`flex items-center gap-1 rounded-xl ${c.id === conversationId ? 'bg-sage-tint/60' : 'hover:bg-sage-tint/40'}`}
              >
                {editingId === c.id ? (
                  <>
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveRename(c.id);
                        else if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-green-strong bg-paper px-2 py-1.5 text-sm focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => saveRename(c.id)}
                      aria-label="Enregistrer le nom"
                      title="Enregistrer"
                      className="mr-1 flex h-7 w-7 flex-none items-center justify-center rounded-full text-green-strong hover:bg-sage-tint"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => switchTo(c.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                      <span className="block truncate text-sm font-medium text-ink">{c.title || 'Conversation'}</span>
                      <span className="text-xs text-ink-soft">{relDate(c.updatedAt)} · {c.messageCount} msg</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(c)}
                      aria-label="Renommer cette conversation"
                      title="Renommer"
                      className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-ink-soft hover:bg-sage-tint hover:text-green-strong"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeConversation(c.id)}
                      aria-label="Supprimer cette conversation"
                      title="Supprimer cette conversation"
                      className="mr-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-clay-tint/50 text-[#c2774f] hover:bg-clay-tint"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  // Jauge de limite : verte → orange (≥ 80 %) → terracotta (au seuil).
  const limitGauge = (
    <span
      title="Messages de cette conversation — au seuil, l'assistant propose d'en ouvrir une nouvelle (coût maîtrisé)."
      className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold ${
        limitReached ? 'bg-clay-tint text-[#c2774f]' : ratio >= 0.8 ? 'bg-orange/20 text-orange' : 'bg-sage-tint text-green-strong'
      }`}
    >
      {count}/{limit}
    </span>
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,760px)_280px] lg:items-start lg:justify-center">
      {/* Mobile : colonne pleine hauteur (chat classique, saisie collée en bas). Desktop : flux normal. */}
      <div className="flex h-[calc(100dvh-8.5rem)] min-w-0 flex-col gap-2 lg:h-auto lg:gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">Assistant</h1>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{currentTitle}</p>
        </div>

        {/* Zone messages : occupe l'espace + scroll (mobile) ; ancrée en bas (récents près de la saisie). */}
        <div className="min-h-0 flex-1 overflow-y-auto lg:min-h-[56vh] lg:flex-none lg:overflow-visible">
          <div className="flex min-h-full flex-col justify-end gap-3 lg:min-h-0 lg:justify-start">
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

          {plan && (
            <div className="w-[88%] self-start rounded-2xl border border-orange bg-[#fdf0e3] p-3.5 shadow-soft">
              <div className="mb-2 flex items-center gap-1.5 text-orange">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                <span className="font-display text-sm font-semibold text-ink">
                  {plan.length > 1 ? `Confirmer ces ${plan.length} actions ?` : 'Confirmer cette action ?'}
                </span>
              </div>
              <ul className="mb-3 flex flex-col gap-1.5">
                {plan.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl border border-line bg-surface p-2.5 text-xs">
                    <span className="mt-0.5 text-green-strong">•</span>
                    <span className="font-semibold text-ink">{a.summary}</span>
                  </li>
                ))}
              </ul>
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

          {messages.length === 0 && !plan && (
            <p className="text-sm text-ink-soft">
              Pose une question, ou demande une action — tout est confirmé avant d’être appliqué.
            </p>
          )}
          <div ref={bottomRef} />
          </div>
        </div>

        <div className="-mx-4 border-t border-line bg-surface px-4 pb-3 pt-2 lg:sticky lg:bottom-0 lg:z-10 lg:mx-0 lg:rounded-2xl lg:border lg:shadow-soft">
          {limitReached && (
            <div className="mb-2 flex flex-col gap-2 rounded-xl border border-orange/50 bg-[#fdf0e3] p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="text-ink">
                Discussion longue ({count}/{limit}). Continue dans une nouvelle conversation pour rester rapide — je garderai le fil.
              </span>
              <button
                type="button"
                onClick={continueInNew}
                disabled={pending}
                className="btn-primary flex-none py-1.5 text-xs disabled:opacity-50"
              >
                Nouvelle conversation
              </button>
            </div>
          )}

          {/* Barre d'outils — sélecteur de conversation + jauge de limite, collés à la saisie (toujours visibles). */}
          <div className="mb-2 flex items-center justify-between gap-2">
            {conversationMenu}
            {limitGauge}
          </div>

          <div className="mb-2 flex gap-2 overflow-x-auto">
            {['Prépare ma liste de la semaine', 'Reconduis mes dernières courses', 'Prix du saumon ?'].map((s) => (
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

      <aside className="hidden flex-col gap-4 lg:flex lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
        <div className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">Contexte</div>
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="mb-3 font-display text-base font-semibold">Repas du jour</h2>
          <div className="flex flex-col gap-2">
            {(context?.meals.length ? context.meals : [{ slot: "Aujourd'hui", name: 'Aucun repas planifié' }]).map(
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
            {(context?.urgentStock.length ? context.urgentStock : [{ name: 'Rien à signaler', label: 'frais', tone: 'ok' }]).map(
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
            <span className="text-ink-soft">Énergie</span>
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
