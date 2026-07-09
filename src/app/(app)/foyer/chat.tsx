'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ChatMessage } from '@/lib/core/household-chat';
import {
  deleteChatAction,
  editChatAction,
  listChatAction,
  markChatReadAction,
  sendChatAction,
} from './chat-actions';

/** Événement fenêtre : le fil vient d'être lu (le badge de la nav se remet à zéro). */
export const CHAT_READ_EVENT = 'mealing:chat-read';

/** Ligne brute reçue par Realtime (postgres_changes sur household_message). */
type MessageRow = {
  id: string;
  household_id: string;
  author_profile_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

const fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function notifyRead(): void {
  void markChatReadAction();
  window.dispatchEvent(new Event(CHAT_READ_EVENT));
}

export function HouseholdChat({
  householdId,
  meId,
  memberNames,
  initialMessages,
  initialHasMore,
}: {
  householdId: string;
  meId: string;
  /** id → prénom (résout les auteurs des messages Realtime sans round-trip). */
  memberNames: Record<string, string>;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  const resolveName = useCallback(
    (authorId: string | null) => (authorId ? (memberNames[authorId] ?? 'Membre') : 'Membre parti'),
    [memberNames],
  );

  const rowToMessage = useCallback(
    (row: MessageRow): ChatMessage => ({
      id: row.id,
      authorId: row.author_profile_id,
      authorName: resolveName(row.author_profile_id),
      body: row.deleted_at ? '' : row.body,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      deleted: row.deleted_at !== null,
    }),
    [resolveName],
  );

  /** Ajout dédupliqué (l'envoi local ET Realtime peuvent livrer le même message). */
  const upsertMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const i = prev.findIndex((m) => m.id === msg.id);
      if (i >= 0) {
        const next = prev.slice();
        next[i] = msg;
        return next;
      }
      return [...prev, msg];
    });
  }, []);

  // Fil lu à l'ouverture de la page.
  useEffect(() => {
    notifyRead();
  }, []);

  // Temps réel : nouveaux messages + éditions/suppressions (RLS respectée côté serveur).
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`household-chat:${householdId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'household_message', filter: `household_id=eq.${householdId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          upsertMessage(rowToMessage(row));
          // Je suis en train de regarder le fil → lu immédiatement.
          if (document.visibilityState === 'visible') notifyRead();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'household_message', filter: `household_id=eq.${householdId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          upsertMessage(rowToMessage(row));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [householdId, rowToMessage, upsertMessage]);

  // Repli sans Realtime : re-synchronise quand l'app revient au premier plan.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void listChatAction().then((res) => {
        if (res.ok) {
          setMessages(res.messages);
          setHasMore(res.hasMore);
          notifyRead();
        }
      });
    };
    window.addEventListener('focus', onVisible);
    return () => window.removeEventListener('focus', onVisible);
  }, []);

  // Auto-scroll en bas quand des messages arrivent (si on n'est pas remonté dans l'historique).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setDraft('');
    void sendChatAction(body)
      .then((res) => {
        if (res.ok) upsertMessage(res.message);
        else {
          setError(res.error);
          setDraft(body); // la saisie n'est jamais perdue
        }
      })
      .catch(() => {
        setError('Connexion impossible — réessaie.');
        setDraft(body);
      })
      .finally(() => setSending(false));
  };

  const loadMore = () => {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    void listChatAction(messages[0].createdAt)
      .then((res) => {
        if (!res.ok) return;
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...res.messages.filter((m) => !known.has(m.id)), ...prev];
        });
        setHasMore(res.hasMore);
        // Conserve la position de lecture (le contenu s'est allongé par le haut).
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight;
        });
      })
      .finally(() => setLoadingMore(false));
  };

  const commitEdit = () => {
    if (!editing) return;
    const { id, text } = editing;
    const body = text.trim();
    if (!body) return;
    setEditing(null);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, body, editedAt: new Date().toISOString() } : m)),
    );
    void editChatAction(id, body).then((res) => {
      if (!res.ok) setError(res.error);
    });
  };

  const remove = (id: string) => {
    setArmedDelete(null);
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body: '', deleted: true } : m)));
    void deleteChatAction(id).then((res) => {
      if (!res.ok) setError(res.error);
    });
  };

  // Groupes par jour pour les séparateurs de date.
  const days = useMemo(() => {
    const out: Array<{ day: string; items: ChatMessage[] }> = [];
    for (const m of messages) {
      const key = dayKey(m.createdAt);
      const last = out[out.length - 1];
      if (last && dayKey(last.items[0].createdAt) === key) last.items.push(m);
      else out.push({ day: fmtDay.format(new Date(m.createdAt)), items: [m] });
    }
    return out;
  }, [messages]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <h2 className="mb-1 font-display text-lg font-semibold">Discussion</h2>
      <p className="mb-3 text-xs text-ink-soft">
        Entre membres du foyer — « je fais les courses ce soir », « il reste du gratin »…
      </p>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex max-h-96 min-h-40 flex-col gap-2 overflow-y-auto rounded-xl border border-line bg-paper/60 p-3"
      >
        {hasMore && (
          <button
            className="mx-auto rounded-full border border-line px-3 py-1 text-xs font-bold text-ink-soft hover:bg-sage-tint/50"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Chargement…' : 'Messages précédents'}
          </button>
        )}
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-soft">
            Aucun message pour l&rsquo;instant — lance la conversation 👋
          </p>
        )}
        {days.map((group) => (
          <div key={group.items[0].id} className="flex flex-col gap-2">
            <p className="py-1 text-center text-[11px] font-semibold text-ink-soft/80">{group.day}</p>
            {group.items.map((m) => {
              const mine = m.authorId === meId;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${mine ? 'text-right' : 'text-left'}`}>
                    <p className="px-1 text-[11px] text-ink-soft">
                      {!mine && <span className="font-bold">{m.authorName} · </span>}
                      {fmtTime.format(new Date(m.createdAt))}
                      {m.editedAt && !m.deleted && ' · modifié'}
                    </p>
                    {editing?.id === m.id ? (
                      <form
                        className="mt-0.5 flex items-center gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitEdit();
                        }}
                      >
                        <input
                          className="field-input py-1 text-sm"
                          value={editing.text}
                          onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                          autoFocus
                        />
                        <button className="text-xs font-bold text-green-strong">OK</button>
                        <button
                          type="button"
                          className="text-xs font-bold text-ink-soft"
                          onClick={() => setEditing(null)}
                        >
                          ✕
                        </button>
                      </form>
                    ) : (
                      <div
                        className={`mt-0.5 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm leading-relaxed ${
                          m.deleted
                            ? 'border border-dashed border-line text-ink-soft/70 italic'
                            : mine
                              ? 'bg-sage-tint text-ink'
                              : 'border border-line bg-surface text-ink'
                        }`}
                      >
                        {m.deleted ? 'Message supprimé' : m.body}
                      </div>
                    )}
                    {mine && !m.deleted && editing?.id !== m.id && (
                      <p className="mt-0.5 flex justify-end gap-2 px-1">
                        <button
                          className="text-[11px] font-bold text-ink-soft hover:text-ink"
                          onClick={() => setEditing({ id: m.id, text: m.body })}
                        >
                          modifier
                        </button>
                        <button
                          className={`text-[11px] font-bold ${
                            armedDelete === m.id ? 'text-red-strong' : 'text-ink-soft hover:text-red-strong'
                          }`}
                          onClick={() => {
                            if (armedDelete === m.id) remove(m.id);
                            else {
                              setArmedDelete(m.id);
                              setTimeout(() => setArmedDelete((a) => (a === m.id ? null : a)), 4000);
                            }
                          }}
                        >
                          {armedDelete === m.id ? 'confirmer ?' : 'supprimer'}
                        </button>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-strong">{error}</p>}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          className="field-input min-h-10 flex-1 resize-none py-2 text-sm"
          rows={1}
          placeholder="Écrire un message…"
          value={draft}
          maxLength={4000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Entrée = envoyer, Maj+Entrée = retour à la ligne (usage messagerie).
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn-primary px-4 py-2 text-sm" disabled={sending || !draft.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
