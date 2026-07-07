'use client';

/**
 * État 4 du handoff — page principale Nutrition (planning rempli).
 * Vue SEMAINE par défaut (l'unité de bienveillance), le JOUR est un zoom.
 * Jauges vers zone + habitudes mélangées, score hebdo doux, couverture visible.
 *
 * Branché sur du réel : jauges (aggregatePeriodNutrition), couverture, score hebdo,
 * détail par jour. Les cartes d'HABITUDE sont encore de démo (backend N1.5).
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  Info,
  Percent,
  Plus,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { GaugeCard, HabitCard, ObservationCard, type GaugeCardData } from './ui';
import { repairNutritionDataAction } from './actions';
import type { DayData, NutrientCard, NutritionSnapshot } from './view-types';

const R1 = (n: number) => Math.round(n * 10) / 10;

export function NutritionDashboard({ snapshot }: { snapshot: NutritionSnapshot }) {
  const [view, setView] = useState<'week' | 'day'>('week');
  const [dayIndex, setDayIndex] = useState(snapshot.todayIndex >= 0 ? snapshot.todayIndex : 0);

  const gaugeCards = snapshot.cards.filter((c) => c.kind === 'gauge');
  const observationCards = snapshot.cards.filter((c) => c.kind === 'observation');
  const eatingDays = Math.max(1, snapshot.daysWithMeals);

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight lg:text-[28px]">Nutrition</h1>
          <p className="font-hand text-base text-sage-deep lg:text-[17px]">déduite de ton planning — zéro saisie</p>
        </div>
        <div className="ml-auto flex items-center rounded-full border border-line bg-surface p-1">
          {(['day', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors ${
                view === v ? 'bg-sage-tint text-ink' : 'text-ink-soft'
              }`}
            >
              {v === 'day' ? 'Jour' : 'Semaine'}
            </button>
          ))}
        </div>
        <span className="hidden text-sm font-bold text-ink-soft sm:inline">{snapshot.weekLabel}</span>
        <Link
          href="/nutrition/suivis"
          className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-sage bg-surface px-4 text-sm font-bold text-sage-deep transition-colors hover:bg-sage-tint/40"
        >
          <Settings2 className="h-[17px] w-[17px]" strokeWidth={1.75} />
          <span className="hidden sm:inline">Gérer mes suivis</span>
        </Link>
      </div>

      {view === 'week' ? (
        <>
          {/* Score hebdo + couverture */}
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <WeeklyScoreCard days={snapshot.days} daysInZone={snapshot.daysInZone} />
            <CompactCoverageCard snapshot={snapshot} />
          </div>

          {/* Cartes de suivi */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {gaugeCards.map((c) => (
              <GaugeCard key={c.code} data={weekGaugeData(c, snapshot, eatingDays)} />
            ))}
            {snapshot.habitCards.map((h) => (
              <HabitCard key={h.name} data={h} />
            ))}
            {observationCards.map((c) => (
              <ObservationCard
                key={c.code}
                code={c.code}
                name={c.name}
                unit={c.unit}
                value={(snapshot.weekReal[c.code] ?? 0) / eatingDays}
                coveragePct={snapshot.coverage.pct}
                points={snapshot.days.filter((d) => d.hasMeals).map((d) => d.real[c.code] ?? 0)}
                trendLabel="cette semaine, jour par jour"
              />
            ))}
          </div>

          <SourcesAndAssistant />
        </>
      ) : (
        <DayView
          days={snapshot.days}
          dayIndex={dayIndex}
          onSelect={setDayIndex}
          cards={gaugeCards}
          coveragePct={snapshot.coverage.pct}
        />
      )}
    </div>
  );
}

/** Données d'une jauge en vue Semaine : réel/planifié moyennés par jour mangé. */
function weekGaugeData(c: NutrientCard, s: NutritionSnapshot, eatingDays: number): GaugeCardData {
  return {
    code: c.code,
    name: c.name,
    unit: c.unit,
    real: (s.weekReal[c.code] ?? 0) / eatingDays,
    planned: (s.weekPlanned[c.code] ?? 0) / eatingDays,
    min: c.min,
    max: c.max,
    coveragePct: s.coverage.pct,
    perDay: true,
  };
}

/* --------------------------- Score hebdomadaire --------------------------- */

const DOT_CLASS: Record<DayData['status'], string> = {
  in: 'bg-green text-white',
  over: 'bg-clay',
  under: 'bg-sage',
  empty: 'border-[1.5px] border-dashed border-sage bg-surface',
};

function WeeklyScoreCard({ days, daysInZone }: { days: DayData[]; daysInZone: number }) {
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-line bg-sage-tint p-5">
      <div className="min-w-0">
        <div className="font-display text-[22px] font-semibold leading-tight">
          Dans la zone {daysInZone} jour{daysInZone > 1 ? 's' : ''} sur 7
        </div>
        <div className="mt-0.5 font-hand text-base text-sage-deep">un écart ponctuel se lisse sur la semaine</div>
      </div>
      <div className="ml-auto flex shrink-0 gap-1.5">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1 text-[10.5px] font-bold text-ink-soft">
            <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full ${DOT_CLASS[d.status]}`}>
              {d.status === 'in' && (
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            {d.weekdayShort}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Couverture ----------------------------- */

function CompactCoverageCard({ snapshot }: { snapshot: NutritionSnapshot }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { coverage } = snapshot;
  const pct = coverage.pct;
  const full = pct === 100 && coverage.ingredientsWithData >= coverage.ingredientsTotal;

  const repair = () =>
    start(async () => {
      await repairNutritionDataAction();
      router.refresh();
    });

  return (
    <div className="rounded-2xl border border-line bg-surface p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2.5 text-[15px] font-bold">
        <Percent className="h-[17px] w-[17px] text-sage-deep" strokeWidth={1.75} />
        Semaine couverte à {pct ?? 0} %
        <span className="ml-auto text-[12.5px] font-semibold text-ink-soft">
          {coverage.ingredientsWithData}/{coverage.ingredientsTotal} ingrédients
        </span>
      </div>
      <div className="relative my-3 h-3 rounded-full border border-line bg-paper">
        <div className="absolute bottom-[2px] left-[2px] top-[2px] rounded-full bg-sage" style={{ width: `${pct ?? 0}%` }} />
      </div>
      {!full && (
        <button
          type="button"
          onClick={repair}
          disabled={pending}
          className="inline-flex h-[38px] items-center gap-2 rounded-xl border-[1.5px] border-sage bg-surface px-3.5 text-[13px] font-bold text-sage-deep transition-colors hover:bg-sage-tint/40 disabled:opacity-50"
        >
          <Plus className="h-[15px] w-[15px]" strokeWidth={1.75} />
          {pending ? 'Complétion…' : 'Compléter les données'}
        </button>
      )}
      {full && <p className="text-[12.5px] font-semibold text-sage-deep">Données complètes — tes repères sont au plus juste.</p>}
    </div>
  );
}

/* ----------------------------- Provenance ----------------------------- */

function SourcesAndAssistant() {
  const [open, setOpen] = useState(true);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-2xl border border-line bg-surface p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 text-[15px] font-bold">
          <Sparkles className="h-[17px] w-[17px] text-sage-deep" strokeWidth={1.75} />
          D’où viennent tes protéines cette semaine
          {open ? (
            <ChevronUp className="ml-auto h-[17px] w-[17px] text-ink-soft" strokeWidth={1.75} />
          ) : (
            <ChevronDown className="ml-auto h-[17px] w-[17px] text-ink-soft" strokeWidth={1.75} />
          )}
        </button>
        {open && (
          <div className="mt-3.5 flex flex-col gap-2.5">
            {[
              { name: 'Chili sin carne (×2)', pct: 78, g: 148 },
              { name: 'Saumon rôti, riz', pct: 42, g: 64 },
              { name: 'Dahl de lentilles', pct: 33, g: 51 },
            ].map((r) => (
              <div key={r.name} className="flex items-center gap-3 text-[13.5px] font-semibold">
                <span className="flex-1 truncate">{r.name}</span>
                <span className="h-[9px] w-[180px] max-w-[40%] rounded-full border border-line bg-paper">
                  <span className="block h-full rounded-full bg-sage" style={{ width: `${r.pct}%` }} />
                </span>
                <span className="w-11 text-right text-ink-soft">{r.g} g</span>
              </div>
            ))}
            <p className="mt-1 text-[11px] text-ink-soft">Aperçu indicatif — le détail par recette arrive avec les suivis d’habitudes.</p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <Link
          href="/assistant"
          className="flex items-center gap-3 rounded-2xl border border-line bg-butter-tint p-4 transition-colors hover:brightness-[0.99]"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-sage-deep" strokeWidth={1.75} />
          <span className="text-[13.5px] font-semibold leading-snug">
            « Comment monter mes protéines sans plus de viande ? » <span className="text-sage-deep">Demande à l’assistant →</span>
          </span>
        </Link>
        <p className="px-1 text-xs text-ink-soft">
          Des estimations d’après tes repas planifiés, pas des mesures. Ceci n’est pas un avis médical. Visible
          uniquement par toi.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- Vue Jour ------------------------------- */

function DayView({
  days,
  dayIndex,
  onSelect,
  cards,
  coveragePct,
}: {
  days: DayData[];
  dayIndex: number;
  onSelect: (i: number) => void;
  cards: NutrientCard[];
  coveragePct: number | null;
}) {
  const day = days[dayIndex];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onSelect(i)}
            className={`flex-1 rounded-xl py-2 text-center text-[12px] font-bold leading-tight transition-colors ${
              i === dayIndex ? 'bg-green-strong text-white' : 'text-ink-soft hover:bg-sage-tint/40'
            }`}
          >
            {d.weekdayShort}
            <br />
            {d.dayNum}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2.5 rounded-xl bg-butter-tint px-3.5 py-2.5 text-[12.5px] font-semibold leading-snug">
        <Info className="h-[15px] w-[15px] shrink-0 text-sage-deep" strokeWidth={1.75} />
        Le jour est un zoom — ton repère reste la semaine.
      </div>

      {!day.hasMeals ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="font-display text-lg font-semibold">Rien de planifié ce jour-là</p>
          <p className="mt-1 text-sm text-ink-soft">Le repère reste la semaine — un jour vide ne change rien.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <GaugeCard
              key={c.code}
              data={{
                code: c.code,
                name: `${c.name} · ${day.weekdayShort}`,
                unit: c.unit,
                real: day.real[c.code] ?? 0,
                planned: day.planned[c.code] ?? 0,
                min: c.min,
                max: c.max,
                coveragePct,
                perDay: false,
                note:
                  (day.real[c.code] ?? 0) < (day.planned[c.code] ?? 0)
                    ? 'Un repas du jour n’est pas encore passé — compté comme prévu, rien à faire.'
                    : 'Sur cette journée — ton repère à viser reste la semaine.',
              }}
            />
          ))}
        </div>
      )}
      <p className="text-center text-[11px] text-ink-soft">Estimations d’après ton planning — pas un avis médical.</p>
    </div>
  );
}

export { R1 };
