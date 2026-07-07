import { Carrot, Check, Salad, Star } from 'lucide-react';
import type { ChildWeekData } from '@/lib/core/habits';

/**
 * État 7 du handoff — Mode enfant (éthique, non négociable) :
 * jamais de calories, jamais de chiffres anxiogènes, jamais de rouge, jamais de
 * « raté ». Variété et découvertes, langage positif et ludique SOBRE.
 *
 * Branché sur le RÉEL (N3+) : variété = légumes DISTINCTS du planning de la
 * semaine (tags du catalogue), découverte = aliment jamais vu sur ~8 semaines,
 * familles = part des repas en contenant. Aucune valeur nutritionnelle affichée.
 */
export function ChildNutrition({
  childName,
  week,
  varietyTarget,
}: {
  childName: string | null;
  week: ChildWeekData;
  varietyTarget: number;
}) {
  const name = childName?.trim() || 'ton enfant';
  const initial = name[0]?.toUpperCase() ?? '?';

  const past = week.vegetablesPast;
  const remaining = Math.max(0, varietyTarget - past.length - week.vegetablesUpcoming.length);
  const rainbow =
    past.length + week.vegetablesUpcoming.length >= varietyTarget
      ? 'l’arc-en-ciel est complet !'
      : remaining === 1
        ? 'encore un et l’arc-en-ciel est complet !'
        : `encore ${remaining} et l’arc-en-ciel est complet !`;

  const familyColor = ['bg-sage', 'bg-butter', 'bg-clay', 'bg-sage'];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-butter bg-butter-tint font-display text-lg font-semibold">
          {initial}
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Les assiettes de {name}</h1>
      </div>
      <p className="font-hand text-[17px] text-sage-deep">variété et équilibre au fil des repas — sans comptage</p>

      {/* Variété de légumes — la carte phare (réelle) */}
      <div className="rounded-2xl border border-line bg-sage-tint p-[18px]">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-surface text-sage-deep">
            <Carrot className="h-[19px] w-[19px]" strokeWidth={1.75} />
          </span>
          <div className="font-display text-[19px] font-semibold">
            {past.length} légume{past.length > 1 ? 's' : ''} différent{past.length > 1 ? 's' : ''} cette semaine
          </div>
        </div>
        {past.length === 0 && week.vegetablesUpcoming.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-soft">
            Pas encore de légumes au planning cette semaine — chaque repas planifié en ajoutera ici.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {past.map((v) => (
              <span key={v} className="inline-flex h-[38px] items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-bold">
                <Check className="h-[13px] w-[13px] text-green-strong" strokeWidth={1.75} />
                {v}
              </span>
            ))}
            {week.vegetablesUpcoming.map((v) => (
              <span
                key={v.name}
                className="inline-flex h-[38px] items-center rounded-full border-[1.5px] border-dashed border-sage bg-surface px-3.5 text-[13px] font-bold text-sage-deep"
              >
                et bientôt… {v.name.toLowerCase()} ({v.day})
              </span>
            ))}
          </div>
        )}
        {(past.length > 0 || week.vegetablesUpcoming.length > 0) && (
          <div className="mt-3 font-hand text-[17px] text-sage-deep">{rainbow}</div>
        )}
      </div>

      {/* Découverte de la semaine — seulement si réelle */}
      {week.discovery && (
        <div className="rounded-2xl border border-line bg-surface p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-butter-tint text-sage-deep">
              <Star className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <div>
              <div className="text-[15px] font-bold">Découverte de la semaine</div>
              <div className="text-[13px] leading-snug text-ink-soft">
                {name} a goûté {week.discovery.name.toLowerCase()} pour la première fois — {week.discovery.day}.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Familles d'aliments (parts de repas — jamais des chiffres nutritionnels) */}
      {week.mealsTotal > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-sage-tint text-sage-deep">
              <Salad className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <div className="text-[15px] font-bold">Un peu de tout, au fil de la semaine</div>
          </div>
          <div className="flex flex-col gap-2.5 text-[13.5px] font-semibold">
            {week.families.map((f, i) => (
              <div key={f.label} className="flex items-center gap-2.5">
                <span className="w-[110px]">{f.label}</span>
                <span className="h-2.5 flex-1 rounded-full border border-line bg-paper">
                  <span
                    className={`block h-full rounded-full ${familyColor[i % familyColor.length]}`}
                    style={{ width: `${Math.round(f.share * 100)}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-xs leading-snug text-ink-soft">
            La part des repas de la semaine qui contient chaque famille — jamais des chiffres. Tout va bien quand ça
            pousse un peu partout.
          </p>
        </div>
      )}
      <p className="text-center text-[11px] text-ink-soft">Vue pensée pour les enfants : ni calories, ni comptage.</p>
    </div>
  );
}
