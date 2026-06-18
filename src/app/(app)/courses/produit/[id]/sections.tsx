'use client';

import { useState, useTransition } from 'react';
import { fetchNutritionAction, getProductTipsAction, getConservationAction } from './actions';
import type { FoodNutritionValue } from '@/lib/core';

const STORAGE_LABEL: Record<string, string> = {
  placard: 'Placard',
  frigo: 'Réfrigérateur',
  congelateur: 'Congélateur',
};

interface ConservationEstimate {
  storage: 'placard' | 'frigo' | 'congelateur';
  duration: string;
  note?: string;
}

/** Conservation par lieu de stockage : estimation IA indicative, à la demande. */
export function ConservationSection({ foodId }: { foodId: string }) {
  const [options, setOptions] = useState<ConservationEstimate[] | null>(null);
  const [pending, start] = useTransition();

  function estimate() {
    start(async () => setOptions((await getConservationAction(foodId)) as ConservationEstimate[]));
  }

  if (options == null) {
    return (
      <button type="button" onClick={estimate} disabled={pending} className="btn-secondary py-2 text-sm disabled:opacity-60">
        {pending ? 'Estimation…' : '🧊 Estimer la conservation'}
      </button>
    );
  }
  if (options.length === 0) {
    return <p className="text-sm text-ink-soft">Pas d’estimation disponible pour cet aliment.</p>;
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {options.map((o) => (
          <li key={o.storage} className="py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold">{STORAGE_LABEL[o.storage] ?? o.storage}</span>
              <span className="ml-auto text-sm font-semibold text-ink">{o.duration}</span>
            </div>
            {o.note && <p className="mt-0.5 text-xs text-ink-soft">{o.note}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs italic text-ink-soft">
        Repères indicatifs (usages FR, estimés automatiquement) — la gestion fine se fait dans le Stock.
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
