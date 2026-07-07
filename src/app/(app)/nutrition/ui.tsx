'use client';

/**
 * Primitives visuelles de la section Nutrition (refonte hi-fi Claude Design,
 * handoff « nutrition-mealing-sans-saisie »).
 *
 * Principes du design portés ici :
 * - « La semaine juge, le jour zoome » — jamais de binaire réussi/raté.
 * - Jauge VERS ZONE (fond = zone cible), jamais une barre 0→max.
 * - Jamais de rouge punitif : « au-dessus » = terracotta douce ; le rouge reste
 *   réservé à Supprimer/Périmé ailleurs dans l'app.
 * - Honnêteté : chaque carte porte son indicateur « couvert à X % ».
 */

import type { ComponentType } from 'react';
import {
  Activity,
  Beef,
  Check,
  Clock,
  Droplet,
  Eye,
  Fish,
  Flame,
  Milk,
  Stethoscope,
  TrendingUp,
  Wheat,
} from 'lucide-react';

type TintKey = 'sage' | 'butter' | 'clay';

const TINT_BG: Record<TintKey, string> = {
  sage: 'bg-sage-tint',
  butter: 'bg-butter-tint',
  clay: 'bg-clay-tint',
};

interface NutrientVisual {
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tint: TintKey;
}

/** Icône Lucide + teinte de pastille par code de nutriment (repli sage/Activity). */
const NUTRIENT_VISUAL: Record<string, NutrientVisual> = {
  energy_kcal: { Icon: Flame, tint: 'clay' },
  protein: { Icon: Beef, tint: 'sage' },
  fat: { Icon: Droplet, tint: 'butter' },
  carbs: { Icon: Wheat, tint: 'butter' },
  fiber: { Icon: Wheat, tint: 'butter' },
  sugars: { Icon: Droplet, tint: 'clay' },
  sodium: { Icon: Activity, tint: 'clay' },
  iron: { Icon: Droplet, tint: 'clay' },
  calcium: { Icon: Milk, tint: 'sage' },
  vitamin_b12: { Icon: Activity, tint: 'sage' },
  magnesium: { Icon: Activity, tint: 'sage' },
  // Codes d'HABITUDE de démo (non-nutriments) — icône dédiée.
  fish: { Icon: Fish, tint: 'butter' },
};

export function nutrientVisual(code: string): NutrientVisual {
  return NUTRIENT_VISUAL[code] ?? { Icon: Activity, tint: 'sage' };
}

/** Pastille d'icône (38 ou 34 px) d'une carte de suivi. */
export function IconTile({
  Icon,
  tint,
  size = 34,
}: {
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tint: TintKey;
  size?: 34 | 38 | 36;
}) {
  const dim = size === 38 ? 'h-[38px] w-[38px]' : size === 36 ? 'h-9 w-9' : 'h-[34px] w-[34px]';
  return (
    <span className={`flex ${dim} shrink-0 items-center justify-center rounded-[10px] ${TINT_BG[tint]} text-sage-deep`}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </span>
  );
}

/* ------------------------------- Badges ------------------------------- */

export function TargetBadge({ kind }: { kind: 'perso' | 'observation' }) {
  if (kind === 'perso') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-clay-tint px-2 py-[3px] text-[10.5px] font-bold text-ink">
        <Stethoscope className="h-[11px] w-[11px]" strokeWidth={1.75} />
        cible perso
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-butter-tint px-2 py-[3px] text-[10.5px] font-bold text-ink">
      <Eye className="h-[11px] w-[11px]" strokeWidth={1.75} />
      en observation
    </span>
  );
}

/* --------------------------- Jauge vers zone --------------------------- */

export type GaugeStatus = 'under' | 'in' | 'over';

/** Statut d'une valeur vis-à-vis de sa zone (jamais « raté » : « en chemin »). */
export function gaugeStatus(real: number, min: number | null, max: number | null): GaugeStatus {
  if (max != null && real > max) return 'over';
  if (min != null && real < min) return 'under';
  return 'in';
}

const FILL_BG: Record<GaugeStatus, string> = {
  under: 'bg-sage',
  in: 'bg-green',
  over: 'bg-clay',
};

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/**
 * La jauge : fond = zone cible, remplissage = réel estimé (couleur selon statut),
 * pastille = planifié. Échelle commune avec de la marge au-dessus de la zone.
 */
export function ZoneGauge({
  real,
  planned,
  min,
  max,
  status,
}: {
  real: number;
  planned: number;
  min: number | null;
  max: number | null;
  status: GaugeStatus;
}) {
  const anchor = Math.max(real, planned, max ?? 0, min ?? 0, 1);
  const scaleMax = anchor * 1.15;
  const pct = (v: number) => clampPct((v / scaleMax) * 100);
  const zoneStart = min != null ? pct(min) : 0;
  const zoneEnd = max != null ? pct(max) : 100;
  const zoneWidth = Math.max(0, zoneEnd - zoneStart);

  return (
    <div className="relative my-[15px] h-[13px] rounded-full border border-line bg-paper">
      {zoneWidth > 0 && (
        <div
          className="absolute bottom-0 top-0 bg-sage-tint"
          style={{ left: `${zoneStart}%`, width: `${zoneWidth}%`, borderRadius: max == null ? '0 999px 999px 0' : undefined }}
        />
      )}
      <div className={`absolute bottom-[2px] left-[2px] top-[2px] rounded-full ${FILL_BG[status]}`} style={{ width: `${pct(real)}%` }} />
      <div
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-ink-soft bg-surface"
        style={{ left: `${pct(planned)}%` }}
      />
    </div>
  );
}

const R1 = (n: number) => Math.round(n * 10) / 10;

/** Libellé de zone : « 110 – 150 », « ≥ 12 », « ≤ 30 » ou « — ». */
export function zoneLabel(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${R1(min)} – ${R1(max)}`;
  if (min != null) return `≥ ${R1(min)}`;
  if (max != null) return `≤ ${R1(max)}`;
  return '—';
}

export interface GaugeCardData {
  code: string;
  name: string;
  unit: string;
  /** Réel estimé, dans l'unité de la vue (par jour). */
  real: number;
  planned: number;
  min: number | null;
  max: number | null;
  coveragePct: number | null;
  badge?: 'perso' | 'observation';
  /** Suffixe « réel estimé / j » ou « réel estimé ». */
  perDay?: boolean;
  /** Message d'accompagnement optionnel (sinon dérivé du statut). */
  note?: string;
}

/** Carte de suivi CHIFFRÉ — jauge vers zone cible. */
export function GaugeCard({ data }: { data: GaugeCardData }) {
  const { Icon, tint } = nutrientVisual(data.code);
  const status = gaugeStatus(data.real, data.min, data.max);
  const valueColor = status === 'in' ? 'text-green-strong' : status === 'over' ? 'text-clay' : '';

  return (
    <div className="rounded-2xl border border-line bg-surface p-[18px]" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2.5">
        <IconTile Icon={Icon} tint={tint} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate font-sans text-[15px] font-bold">
            {data.name}
            {data.badge && <TargetBadge kind={data.badge} />}
          </div>
          <div className="text-[11.5px] font-semibold text-ink-soft">
            {data.coveragePct != null ? `couvert à ${data.coveragePct} %` : 'données incomplètes'}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-display text-[21px] font-semibold ${valueColor}`}>
            {R1(data.real)} <span className="text-[13px]">{data.unit}</span>
          </div>
          <div className="text-[11px] font-semibold text-ink-soft">réel estimé{data.perDay ? ' / j' : ''}</div>
        </div>
      </div>

      <ZoneGauge real={data.real} planned={data.planned} min={data.min} max={data.max} status={status} />

      <div className="flex justify-between text-[11.5px] font-semibold text-ink-soft">
        <span>○ planifié {R1(data.planned)}</span>
        <span>zone {zoneLabel(data.min, data.max)}</span>
      </div>

      {status === 'in' ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-bold text-green-strong">
          <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
          Dans la zone
        </div>
      ) : status === 'under' ? (
        <div className="mt-2.5 rounded-[10px] bg-sage-tint px-2.5 py-[7px] text-[12.5px] font-semibold leading-snug text-sage-deep">
          {data.note ?? 'Un peu en dessous cette semaine — les repas à venir peuvent combler l’écart.'}
        </div>
      ) : (
        <div className="mt-2.5 rounded-[10px] bg-clay-tint px-2.5 py-[7px] text-[12.5px] font-semibold leading-snug text-ink">
          {data.note ?? 'Au-dessus du repère — ça se lisse sur la semaine, rien à corriger.'}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Habitude ----------------------------- */

export interface HabitCardData {
  name: string;
  code: string;
  /** « au moins » (minimum) ou « au plus » (limite). */
  direction: 'min' | 'max';
  target: number;
  period: 'week' | 'day';
  done: number;
  /** Occurrences déjà planifiées mais pas encore passées. */
  upcoming: number;
  coveragePct: number | null;
  /** Détail de la prochaine occurrence à venir (« saumon planifié vendredi »). */
  upcomingLabel?: string;
  /** Ligne d'état quand tout est passé (« pile sur le repère — tout va bien »). */
  doneLabel?: string;
}

/** Carte de suivi d'HABITUDE — occurrences comptées depuis le planning vers un repère. */
export function HabitCard({ data }: { data: HabitCardData }) {
  const { Icon, tint } = nutrientVisual(data.code);
  const per = data.period === 'week' ? 'semaine' : 'jour';
  const dirLabel = data.direction === 'min' ? 'au moins' : 'au plus';
  const met = data.direction === 'min' ? data.done + data.upcoming >= data.target : data.done <= data.target;
  const isLimit = data.direction === 'max';

  // Pastilles : faites (vert plein / clay pour une limite), à venir (pointillé + horloge),
  // manquantes (contour simple) — dans la limite du repère affiché.
  const slots = Math.max(data.target, data.done + data.upcoming);
  const cells: Array<'done' | 'upcoming' | 'todo'> = [];
  for (let i = 0; i < slots; i++) {
    if (i < data.done) cells.push('done');
    else if (i < data.done + data.upcoming) cells.push('upcoming');
    else cells.push('todo');
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-[18px]" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2.5">
        <IconTile Icon={Icon} tint={tint} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-sans text-[15px] font-bold">{data.name}</div>
          <div className="text-[11.5px] font-semibold text-ink-soft">
            {dirLabel} {data.target}× / {per}
            {data.coveragePct != null ? ` · couvert à ${data.coveragePct} %` : ''}
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 font-display text-[19px] font-semibold ${met && !isLimit ? 'text-green-strong' : ''}`}
        >
          {data.done}/{data.target}
          {met && <Check className="h-4 w-4" strokeWidth={1.75} />}
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2.5">
        {cells.map((c, i) => (
          <span
            key={i}
            className={
              c === 'done'
                ? isLimit
                  ? 'flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] border-clay bg-clay-tint text-ink'
                  : 'flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] border-green bg-sage-tint text-green-strong'
                : c === 'upcoming'
                  ? 'flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] border-dashed border-sage bg-surface text-sage-deep'
                  : 'flex h-[30px] w-[30px] items-center justify-center rounded-full border border-line bg-surface'
            }
          >
            {c === 'done' ? (
              <Check className="h-[15px] w-[15px]" strokeWidth={1.75} />
            ) : c === 'upcoming' ? (
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : null}
          </span>
        ))}
        <span className="ml-1 text-[12.5px] font-semibold leading-tight text-ink-soft">
          {data.upcoming > 0 ? `dont ${data.upcoming} à venir — ${data.upcomingLabel ?? 'planifié'}` : (data.doneLabel ?? 'sur le repère — tout va bien')}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------- Sparkline ----------------------------- */

/** Mini-courbe de tendance (suivi « en observation »). */
export function Sparkline({ points, height = 44 }: { points: number[]; height?: number }) {
  const w = 220;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points
    .map((p, i) => `${Math.round(i * step)},${Math.round(height - 6 - ((p - min) / span) * (height - 12))}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <polyline points={coords} fill="none" stroke="var(--color-sage)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Bloc d'observation (valeur + sparkline + tendance) — pas de cible, juste la tendance. */
export function ObservationCard({
  code,
  name,
  unit,
  value,
  coveragePct,
  points,
  trendLabel = '4 dernières semaines',
}: {
  code: string;
  name: string;
  unit: string;
  value: number;
  coveragePct: number | null;
  points: number[];
  trendLabel?: string;
}) {
  const { Icon, tint } = nutrientVisual(code);
  return (
    <div className="rounded-2xl border border-line bg-surface p-[18px]" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2.5">
        <IconTile Icon={Icon} tint={tint} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-sans text-[15px] font-bold">
            {name}
            <TargetBadge kind="observation" />
          </div>
          <div className="text-[11.5px] font-semibold text-ink-soft">
            {coveragePct != null ? `couvert à ${coveragePct} %` : 'données incomplètes'}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-[21px] font-semibold">
            {R1(value)} <span className="text-[13px]">{unit}</span>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Sparkline points={points} />
      </div>
      <div className="flex justify-between text-[11.5px] font-semibold text-ink-soft">
        <span>{trendLabel}</span>
        <span className="inline-flex items-center gap-1 text-sage-deep">
          <TrendingUp className="h-[13px] w-[13px]" strokeWidth={1.75} />
          tendance douce à la hausse
        </span>
      </div>
    </div>
  );
}
