'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { askAgentAction, executeAgentAction, createConversationAction } from './assistant/actions';
import type { ProposedAction } from '@/lib/ai/agent';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const POS_KEY = 'mealing:assistant-bubble:pos';
const BUBBLE = 56;
const PANEL_W = 360;
const PANEL_H = 480;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Bulle d'assistant flottante (façon Messenger) — montée dans le shell `(app)`, donc
 * disponible sur TOUTES les pages et persistante à travers la navigation (le layout ne se
 * démonte pas). Réutilise tel quel le moteur agent (`askAgentAction`/`executeAgentAction`)
 * et son GARDE-FOU : toute écriture passe par une carte de confirmation. Une conversation
 * n'est créée qu'au 1er message (pas de pollution). Desktop : fenêtre flottante draggable
 * (position mémorisée). Mobile : feuille qui glisse du bas. Masquée sur `/assistant` (redondant).
 */
export function AssistantBubble() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);
  // Marge haute = hauteur de l'en-tête sticky (+8) → la bulle ET la fenêtre ne passent
  // jamais SOUS la bande de navigation (sinon inaccessibles / coupées).
  const [topSafe, setTopSafe] = useState(72);

  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [plan, setPlan] = useState<ProposedAction[] | null>(null);

  const posRef = useRef(pos);
  const topSafeRef = useRef(72);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  /** Hauteur de l'en-tête sticky + petite marge (recalculée au montage et au resize). */
  function headerSafe(): number {
    const h = document.querySelector('header')?.getBoundingClientRect().height ?? 64;
    return Math.round(h) + 8;
  }

  // Init position + détection mobile (lecture de `window` → uniquement après montage).
  // Déféré via rAF : le setState n'est pas dans le corps synchrone de l'effet (cascading renders).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = headerSafe();
      topSafeRef.current = top;
      setTopSafe(top);
      setIsMobile(vw < 640);
      let p = { x: vw - BUBBLE - 20, y: vh - BUBBLE - 24 };
      try {
        const raw = localStorage.getItem(POS_KEY);
        if (raw) {
          const s = JSON.parse(raw) as { x: number; y: number };
          if (typeof s.x === 'number' && typeof s.y === 'number') p = s;
        }
      } catch {
        /* ignore */
      }
      setPos({ x: clamp(p.x, 8, vw - BUBBLE - 8), y: clamp(p.y, top, vh - BUBBLE - 8) });
      setMounted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const onResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = headerSafe();
      topSafeRef.current = top;
      setTopSafe(top);
      setIsMobile(vw < 640);
      setPos((p) => ({ x: clamp(p.x, 8, vw - BUBBLE - 8), y: clamp(p.y, top, vh - BUBBLE - 8) }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mounted]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, plan, pending, open]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Départ toujours enregistré (tap → ouverture, glisser → déplacement). Le pointer capture
    // garde les events même si le doigt sort de la bulle (drag fluide, desktop ET mobile).
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    // Seuil un peu plus haut (tactile = plus de tremblement) pour bien distinguer tap/glisser.
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    if (d.moved) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({ x: clamp(d.ox + dx, 8, vw - BUBBLE - 8), y: clamp(d.oy + dy, topSafeRef.current, vh - BUBBLE - 8) });
    }
  }, []);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(posRef.current));
      } catch {
        /* ignore */
      }
    } else {
      setOpen((o) => !o);
    }
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    setPlan(null);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setPending(true);
    try {
      // Conversation créée au 1er message seulement (pas à l'ouverture → zéro conv. vide).
      let cid = conversationId;
      if (!cid) {
        const created = await createConversationAction();
        cid = created?.id ?? '';
        if (cid) setConversationId(cid);
      }
      const d = await askAgentAction(text, cid || undefined);
      if (d.conversationId && d.conversationId !== cid) setConversationId(d.conversationId);
      setMessages((m) => [...m, { role: 'assistant', content: d.result.message }]);
      if (d.result.type === 'plan' && d.result.actions.length > 0) setPlan(d.result.actions);
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

  function newConversation() {
    setConversationId('');
    setMessages([]);
    setPlan(null);
    setInput('');
  }

  if (!mounted || pathname === '/assistant') return null;

  // Position du panneau desktop : ancré au-dessus de la bulle (ou en dessous si pas la place),
  // jamais plus haut que `topSafe` (sous l'en-tête) ni hors de l'écran.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const panelLeft = clamp(pos.x + BUBBLE - PANEL_W, 8, Math.max(8, vw - PANEL_W - 8));
  let panelTop = pos.y - PANEL_H - 12;
  if (panelTop < topSafe) panelTop = pos.y + BUBBLE + 12; // pas la place au-dessus → en dessous
  panelTop = clamp(panelTop, topSafe, Math.max(topSafe, vh - PANEL_H - 8));

  return (
    <>
      {/* Lanceur */}
      <button
        type="button"
        aria-label={open ? "Fermer l'assistant" : 'Ouvrir l’assistant'}
        title="Assistant"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ left: pos.x, top: pos.y, width: BUBBLE, height: BUBBLE, touchAction: 'none' }}
        className="fixed z-[55] flex items-center justify-center rounded-full bg-green-strong text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
            <path d="M9.5 9.5h.01M14.5 9.5h.01M9 14a4 4 0 0 0 6 0" />
          </svg>
        )}
      </button>

      {open && (
        <div
          style={isMobile ? undefined : { left: panelLeft, top: panelTop, width: PANEL_W, height: PANEL_H }}
          className={
            isMobile
              ? 'fixed inset-x-0 bottom-0 z-[60] flex h-[82vh] flex-col rounded-t-3xl border border-line bg-surface shadow-2xl'
              : 'fixed z-[60] flex flex-col rounded-3xl border border-line bg-surface shadow-2xl'
          }
        >
          {/* En-tête */}
          <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sage-tint text-green-strong">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
                </svg>
              </span>
              <span className="font-display text-sm font-semibold text-ink">Assistant</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={newConversation}
                title="Nouvelle conversation"
                aria-label="Nouvelle conversation"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-sage-tint hover:text-green-strong"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <Link
                href={conversationId ? `/assistant?c=${conversationId}` : '/assistant'}
                onClick={() => setOpen(false)}
                title="Ouvrir en grand"
                aria-label="Ouvrir dans la section Assistant"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-sage-tint hover:text-green-strong"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M21 3l-9 9M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                </svg>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Réduire"
                aria-label="Réduire"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-sage-tint hover:text-green-strong"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /></svg>
              </button>
            </div>
          </div>

          {/* Fil */}
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
            {messages.length === 0 && !plan && (
              <div className="flex flex-col gap-2.5">
                <p className="text-sm text-ink-soft">Demande-moi une info ou une action — tout est confirmé avant d’être appliqué.</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Prépare ma liste de la semaine', 'Quoi à consommer vite ?'].map((s) => (
                    <button key={s} type="button" onClick={() => setInput(s)} className="nav-pill bg-sage-tint text-sage-deep">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === 'user'
                    ? 'max-w-[85%] self-end rounded-2xl rounded-br-sm bg-green px-3 py-2 text-sm text-white'
                    : 'max-w-[88%] self-start rounded-2xl rounded-bl-sm bg-sage-tint px-3 py-2 text-sm text-ink'
                }
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            ))}

            {plan && (
              <div className="self-start rounded-2xl border border-orange bg-[#fdf0e3] p-3 shadow-soft">
                <div className="mb-1.5 flex items-center gap-1.5 text-orange">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
                  </svg>
                  <span className="font-display text-xs font-semibold text-ink">
                    {plan.length > 1 ? `Confirmer ces ${plan.length} actions ?` : 'Confirmer cette action ?'}
                  </span>
                </div>
                <ul className="mb-2.5 flex flex-col gap-1">
                  {plan.map((a, i) => (
                    <li key={i} className="flex items-start gap-1.5 rounded-lg border border-line bg-surface p-2 text-xs">
                      <span className="mt-0.5 text-green-strong">•</span>
                      <span className="font-semibold text-ink">{a.summary}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button onClick={confirm} disabled={pending} className="btn-primary flex-1 py-2 text-xs disabled:opacity-50">Confirmer</button>
                  <button onClick={cancel} disabled={pending} className="btn-secondary px-3 py-2 text-xs">Annuler</button>
                </div>
              </div>
            )}

            {pending && (
              <div className="self-start rounded-2xl rounded-bl-sm bg-sage-tint px-3 py-2 text-sm text-ink-soft">…</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Saisie */}
          <form onSubmit={send} className="flex items-center gap-2 border-t border-line px-3 py-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Écris à l’assistant…"
              enterKeyHint="send"
              className="flex-1 rounded-full border border-line bg-paper px-3.5 py-2 text-sm focus:outline-2 focus:outline-green"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Envoyer"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-green-strong text-white disabled:opacity-50"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
