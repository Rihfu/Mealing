'use client';

import { useState, useTransition } from 'react';
import { fetchNutritionAction, getProductTipsAction, getConservationAction, type ConservationDaysItem } from './actions';
import type { FoodNutritionValue } from '@/lib/core';

/**
 * Conservation par lieu : estimation IA en JOURS, valeur FIXE (pas d'intervalle), à la
 * demande. SOURCE UNIQUE partagée avec le Stock (même cache) → la fiche et le Stock
 * affichent exactement la même durée.
 */
export function ConservationSection({ foodId }: { foodId: string }) {
  const [items, setItems] = useState<ConservationDaysItem[] | null>(null);
  const [pending, start] = useTransition();

  function estimate() {
    start(async () => setItems(await getConservationAction(foodId)));
  }

  if (items == null) {
    return (
      <button type="button" onClick={estimate} disabled={pending} className="btn-secondary flex items-center gap-2 py-2 text-sm disabled:opacity-60">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 7v5l3 2" />
        </svg>
        {pending ? 'Estimation…' : 'Estimer la conservation'}
      </button>
    );
  }
  if (items.length === 0) {
    return <p className="text-sm text-ink-soft">Pas d’estimation disponible pour cet aliment.</p>;
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {items.map((o) => (
          <li key={o.storage} className="py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold">{o.label}</span>
              <span className="ml-auto text-sm font-semibold text-ink">
                {o.unopenedDays} jour{o.unopenedDays > 1 ? 's' : ''}
              </span>
            </div>
            {o.openedDays != null && o.openedDays !== o.unopenedDays && (
              <p className="mt-0.5 text-xs text-ink-soft">une fois entamé : {o.openedDays} j</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs italic text-ink-soft">
        Repère indicatif (usages FR) — même estimation que dans le Stock.
      </p>
    </>
  );
}

/** Nutrition : valeurs stockées si dispo, sinon bouton de récupération USDA/OFF. */
export function NutritionSection({ foodId, initial }: { foodId: string; initial: FoodNutritionValue[] | null }) {
  const [values, setValues] = useState<FoodNutritionValue[] | null>(initial);
  const [pending, start] = useTransition();
  const [tried, setTried] = useState(false);

  function fetchNow() {
    setTried(true);
    start(async () => setValues(await fetchNutritionAction(foodId)));
  }

  if (values && values.length > 0) {
    return (
      <>
        <ul className="divide-y divide-line">
          {values.map((v) => (
            <li key={v.code} className={`flex justify-between gap-4 py-1.5 text-sm ${v.isBase ? 'font-semibold' : ''}`}>
              <span className={v.isBase ? '' : 'text-ink-soft'}>{v.name}</span>
              <span>{Math.round(v.amount * 10) / 10} {v.unit}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-soft">Pour 100 g / 100 ml · source USDA / Open Food Facts.</p>
      </>
    );
  }

  return (
    <div className="text-sm text-ink-soft">
      <p>Aucune valeur nutritionnelle enregistrée pour cet aliment.</p>
      <button type="button" onClick={fetchNow} disabled={pending} className="btn-secondary mt-2 py-2 text-sm disabled:opacity-60">
        {pending ? 'Recherche…' : 'Récupérer la nutrition (USDA / OFF)'}
      </button>
      {tried && !pending && (!values || values.length === 0) && (
        <p className="mt-2 text-xs">Pas de données trouvées chez les fournisseurs pour ce nom.</p>
      )}
    </div>
  );
}

/** Conseils indicatifs (IA) à la demande — clairement étiquetés. */
export function TipsSection({ foodId }: { foodId: string }) {
  const [tips, setTips] = useState<string[] | null>(null);
  const [pending, start] = useTransition();

  function getTips() {
    start(async () => setTips(await getProductTipsAction(foodId)));
  }

  return (
    <div className="text-sm">
      {tips == null ? (
        <button type="button" onClick={getTips} disabled={pending} className="btn-secondary py-2 text-sm disabled:opacity-60">
          {pending ? 'Un instant…' : '💡 Obtenir des conseils'}
        </button>
      ) : tips.length === 0 ? (
        <p className="text-ink-soft">Pas de conseils disponibles pour le moment.</p>
      ) : (
        <>
          <ul className="list-disc space-y-1 pl-5 text-ink-soft">
            {tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs italic text-ink-soft">
            Conseils indicatifs générés automatiquement — à vérifier selon ton contexte.
          </p>
        </>
      )}
    </div>
  );
}
