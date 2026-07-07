import { Carrot, Check, Salad, Star } from 'lucide-react';

/**
 * État 7 du handoff — Mode enfant (éthique, non négociable) :
 * jamais de calories, jamais de chiffres anxiogènes, jamais de rouge, jamais de
 * « raté ». Variété et découvertes, langage positif et ludique SOBRE.
 *
 * Les données de variété (légumes découverts, familles d'aliments) sont de DÉMO —
 * elles seront dérivées du planning avec les suivis d'habitudes (N1.5). Le mode
 * enfant lui-même est réel (persona `enfant` / `is_child`).
 */
export function ChildNutrition({ childName }: { childName: string | null }) {
  const name = childName?.trim() || 'ton enfant';
  const initial = name[0]?.toUpperCase() ?? '?';

  const veggies = [
    { label: 'Carotte', state: 'done' as const },
    { label: 'Courgette', state: 'done' as const },
    { label: 'Tomate', state: 'done' as const },
    { label: 'Fenouil — nouveau !', state: 'new' as const },
    { label: 'et bientôt… petits pois (jeudi)', state: 'soon' as const },
  ];
  const families = [
    { label: 'Légumes', pct: 80, color: 'bg-sage' },
    { label: 'Fruits', pct: 65, color: 'bg-butter' },
    { label: 'Céréales', pct: 72, color: 'bg-clay' },
    { label: 'Protéines', pct: 58, color: 'bg-sage' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-butter bg-butter-tint font-display text-lg font-semibold">
          {initial}
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Les assiettes de {name}</h1>
      </div>
      <p className="font-hand text-[17px] text-sage-deep">variété et équilibre au fil des repas — sans comptage</p>

      {/* Variété de légumes — la carte phare */}
      <div className="rounded-2xl border border-line bg-sage-tint p-[18px]">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-surface text-sage-deep">
            <Carrot className="h-[19px] w-[19px]" strokeWidth={1.75} />
          </span>
          <div className="font-display text-[19px] font-semibold">4 légumes différents cette semaine</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {veggies.map((v) => (
            <span
              key={v.label}
              className={`inline-flex h-[38px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ${
                v.state === 'new'
                  ? 'border-[1.5px] border-butter bg-butter-tint'
                  : v.state === 'soon'
                    ? 'border-[1.5px] border-dashed border-sage bg-surface text-sage-deep'
                    : 'border border-line bg-surface'
              }`}
            >
              {v.state === 'done' && <Check className="h-[13px] w-[13px] text-green-strong" strokeWidth={1.75} />}
              {v.state === 'new' && <Star className="h-[13px] w-[13px] text-sage-deep" strokeWidth={1.75} />}
              {v.label}
            </span>
          ))}
        </div>
        <div className="mt-3 font-hand text-[17px] text-sage-deep">encore un et l’arc-en-ciel est complet !</div>
      </div>

      {/* Découverte de la semaine */}
      <div className="rounded-2xl border border-line bg-surface p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-butter-tint text-sage-deep">
            <Star className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div>
            <div className="text-[15px] font-bold">Découverte de la semaine</div>
            <div className="text-[13px] leading-snug text-ink-soft">
              {name} a goûté le fenouil pour la première fois — mardi, dans le gratin.
            </div>
          </div>
        </div>
      </div>

      {/* Familles d'aliments (jamais des chiffres) */}
      <div className="rounded-2xl border border-line bg-surface p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-sage-tint text-sage-deep">
            <Salad className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div className="text-[15px] font-bold">Un peu de tout, au fil de la semaine</div>
        </div>
        <div className="flex flex-col gap-2.5 text-[13.5px] font-semibold">
          {families.map((f) => (
            <div key={f.label} className="flex items-center gap-2.5">
              <span className="w-[110px]">{f.label}</span>
              <span className="h-2.5 flex-1 rounded-full border border-line bg-paper">
                <span className={`block h-full rounded-full ${f.color}`} style={{ width: `${f.pct}%` }} />
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-xs leading-snug text-ink-soft">
          Des familles d’aliments, jamais des chiffres. Tout va bien quand ça pousse un peu partout.
        </p>
      </div>
      <p className="text-center text-[11px] text-ink-soft">Vue pensée pour les enfants : ni calories, ni comptage.</p>
    </div>
  );
}
