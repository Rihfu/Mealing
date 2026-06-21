'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCachedResource } from '@/lib/offline/cache';
import { FoodLink } from '@/components/food-link';
import { getExpiryDigestAction, setExpiryThresholdAction } from './expiry-actions';
import { PushOptIn } from './push-optin';
import type { ExpiryDigest, ExpiryDigestItem, ExpirySeverity } from '@/lib/core';

/** Libellé compact du délai (négatif = déjà périmé). */
function dayLabel(d: number): string {
  if (d < 0) return d === -1 ? 'périmé depuis 1 j' : `périmé depuis ${-d} j`;
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'demain';
  return `dans ${d} j`;
}

const SEV: Record<ExpirySeverity, { label: string; color: string }> = {
  expired: { label: 'Périmés', color: '#dd5240' },
  urgent: { label: "À consommer aujourd'hui / demain", color: '#ef8a3c' },
  soon: { label: 'Bientôt', color: '#c2882f' },
};

function Section({ severity, items }: { severity: ExpirySeverity; items: ExpiryDigestItem[] }) {
  if (items.length === 0) return null;
  const meta = SEV[severity];
  return (
    <div className="mt-2 first:mt-0">
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="text-xs font-semibold text-ink-soft">· {items.length}</span>
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1.5 hover:bg-sage-tint/40">
            <FoodLink foodId={it.foodId} from="/stock" className="min-w-0 flex-1 truncate text-sm font-medium">
              {it.name}
            </FoodLink>
            <span className="shrink-0 text-xs font-semibold" style={{ color: meta.color }}>
              {dayLabel(it.daysRemaining)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Cloche de péremption (in-app, globale) : badge compteur + panneau groupé par sévérité.
 * Lit le digest en CACHE-FIRST (IndexedDB) → instantané + offline-aware ; revalide à
 * l'ouverture et au retour au premier plan (les mutations du Stock se reflètent ainsi).
 * Dérivé de getStockWithExpiry (lecture seule, aucune IA).
 */
export function ExpiryBell() {
  const { data, refresh } = useCachedResource<ExpiryDigest | null>('expiry:digest', getExpiryDigestAction);
  const digest = data ?? null;
  const [open, setOpen] = useState(false);
  const [thresholdOverride, setThresholdOverride] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const total = digest?.total ?? 0;
  const badgeColor = digest
    ? digest.expired.length > 0
      ? SEV.expired.color
      : digest.urgent.length > 0
        ? SEV.urgent.color
        : digest.soon.length > 0
          ? SEV.soon.color
          : null
    : null;

  // Ferme au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  // Revalide quand l'app revient au premier plan (reflète les mutations faites ailleurs).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void refresh(); // rafraîchit à l'ouverture (hors du rendu)
  };

  const threshold = thresholdOverride ?? digest?.threshold ?? 3;
  const commitThreshold = useCallback(
    (value: number) => {
      const v = Math.max(1, Math.min(60, Math.round(value)));
      setThresholdOverride(v);
      void setExpiryThresholdAction(v).then(() => refresh());
    },
    [refresh],
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={total > 0 ? `Péremption : ${total} article(s) à surveiller` : 'Péremption'}
        title="Rappels de péremption"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sage-tint/60"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {total > 0 && badgeColor && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ backgroundColor: badgeColor }}
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-3 shadow-soft">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="font-display text-sm font-bold text-ink">Péremption</h2>
            <Link href="/stock" onClick={() => setOpen(false)} className="text-xs font-semibold text-green-strong hover:underline">
              Voir le stock
            </Link>
          </div>

          <div className="mt-2 max-h-[60vh] overflow-y-auto">
            {total === 0 ? (
              <p className="px-1 py-4 text-center text-sm text-ink-soft">Rien ne périme bientôt 🎉</p>
            ) : (
              <>
                <Section severity="expired" items={digest!.expired} />
                <Section severity="urgent" items={digest!.urgent} />
                <Section severity="soon" items={digest!.soon} />
              </>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-line pt-2.5 px-1">
            <label htmlFor="expiry-threshold" className="text-xs font-medium text-ink-soft">
              M&apos;alerter
            </label>
            <input
              id="expiry-threshold"
              type="number"
              min={1}
              max={60}
              value={threshold}
              onChange={(e) => setThresholdOverride(Number(e.target.value))}
              onBlur={(e) => commitThreshold(Number(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="field-input w-14 px-2 py-1 text-center text-xs"
            />
            <span className="text-xs font-medium text-ink-soft">jours avant péremption</span>
          </div>

          <PushOptIn />
        </div>
      )}
    </div>
  );
}
