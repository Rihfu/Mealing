'use client';

/**
 * États 2/3 du handoff — onboarding facettes.
 *
 * ⚠️ Le pivot « facettes → règles curées → suivis » (N1.5) n'a pas encore de
 * backend : les chips de facettes et les recommandations d'HABITUDES sont VISUELLES
 * (démo). L'activation, elle, est RÉELLE : elle crée un profil nutrition fonctionnel
 * (persona « équilibre » par défaut + infos corporelles optionnelles + objectifs
 * calculés via référence ANSES/formule), pour que hero → onboarding → dashboard
 * marche de bout en bout. N1.5 remplacera le persona par le moteur de facettes.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ChevronUp, Lock, Percent } from 'lucide-react';
import { personaById, type Sex } from '@/lib/core/nutrition-profile';
import { applyNutritionSetupAction, computeTargetsAction, repairNutritionDataAction } from '../actions';
import { FACET_GROUPS, DEMO_RECOMMENDATIONS, DEMO_SELECTED_FACETS } from '../demo-data';

const TINT_BG = { sage: 'bg-sage-tint', butter: 'bg-butter-tint', clay: 'bg-clay-tint' } as const;

export function Onboarding({
  coveragePct,
  ingredientsWithData,
  ingredientsTotal,
}: {
  coveragePct: number | null;
  ingredientsWithData: number;
  ingredientsTotal: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<'A' | 'B' | 'C'>('A');
  const [error, setError] = useState<string | null>(null);

  const [facets, setFacets] = useState<Set<string>>(new Set(DEMO_SELECTED_FACETS));
  const [affiner, setAffiner] = useState(true);
  const [birthYear, setBirthYear] = useState('');
  const [sex, setSex] = useState<Sex | ''>('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');

  const [keptRecs, setKeptRecs] = useState<Set<string>>(new Set(DEMO_RECOMMENDATIONS.map((r) => r.id)));
  const [proteinMin, setProteinMin] = useState('110');
  const [proteinMax, setProteinMax] = useState('150');

  const toggleFacet = (id: string) =>
    setFacets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const num = (s: string) => {
    const n = Number(s.replace(',', '.'));
    return s.trim() !== '' && !Number.isNaN(n) && n > 0 ? n : null;
  };

  const activate = (goToFin: boolean) => {
    setError(null);
    start(async () => {
      try {
        const body = { birthYear: num(birthYear), sex: sex || null, weightKg: num(weight), heightCm: num(height) };
        const zones = await computeTargetsAction({ persona: 'equilibre', ...body, activityLevel: null });
        const tracked = personaById('equilibre')?.tracked ?? ['protein', 'fiber'];
        const proteinKept = keptRecs.has('proteines');
        const targets = zones.map((z) =>
          z.code === 'protein' && proteinKept
            ? { code: 'protein', min: num(proteinMin), max: num(proteinMax) }
            : { code: z.code, min: z.min, max: z.max },
        );
        const res = await applyNutritionSetupAction({
          persona: 'equilibre',
          ...body,
          activityLevel: null,
          targets,
          tracked,
        });
        if (!res.ok) throw new Error();
        if (goToFin) setStep('C');
        else router.push('/nutrition');
      } catch {
        setError('Activation impossible — réessaie.');
      }
    });
  };

  return (
    <div className="mx-auto max-w-lg">
      {step === 'A' && (
        <section>
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex gap-1.5">
              <span className="h-1.5 w-[22px] rounded-full bg-green" />
              <span className="h-1.5 w-[22px] rounded-full bg-line" />
            </div>
            <button type="button" onClick={() => setStep('B')} className="text-sm font-bold text-ink-soft">
              Passer
            </button>
          </div>
          <h1 className="font-display text-[27px] font-semibold leading-tight tracking-tight">Parle-nous de toi</h1>
          <div className="mb-4 font-hand text-lg text-sage-deep">tout est optionnel, promis</div>

          {FACET_GROUPS.map((g) => (
            <div key={g.key} className="mb-5">
              <div className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-ink-soft">{g.title}</div>
              <div className="flex flex-wrap gap-2">
                {g.facets.map((f) => {
                  const on = facets.has(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleFacet(f.id)}
                      className={`inline-flex h-[42px] items-center gap-1.5 rounded-full px-3.5 text-[13.5px] transition-colors ${
                        on ? 'border-[1.5px] border-green bg-sage-tint font-bold' : 'border border-line bg-surface font-semibold'
                      }`}
                    >
                      <f.Icon className={`h-4 w-4 ${on ? 'text-green-strong' : 'text-sage-deep'}`} strokeWidth={1.75} />
                      {f.label}
                      {on && <Check className="h-3.5 w-3.5 text-green-strong" strokeWidth={1.75} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mb-5 rounded-2xl border border-line bg-surface p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <button type="button" onClick={() => setAffiner((o) => !o)} className="flex w-full items-center justify-between text-[15px] font-bold">
              Affiner mes repères
              <ChevronUp className={`h-[18px] w-[18px] text-ink-soft transition-transform ${affiner ? '' : 'rotate-180'}`} strokeWidth={1.75} />
            </button>
            <p className="mb-3.5 mt-1 text-[12.5px] leading-snug text-ink-soft">Optionnel — rend les zones cibles plus justes.</p>
            {affiner && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Année de naissance">
                    <input value={birthYear} onChange={(e) => setBirthYear(e.target.value)} inputMode="numeric" placeholder="1991" className="field-input w-full py-2" />
                  </Field>
                  <Field label="Sexe">
                    <select value={sex} onChange={(e) => setSex(e.target.value as Sex | '')} className="field-input w-full py-2">
                      <option value="">—</option>
                      <option value="female">Femme</option>
                      <option value="male">Homme</option>
                    </select>
                  </Field>
                  <Field label="Poids">
                    <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="63 kg" className="field-input w-full py-2" />
                  </Field>
                  <Field label="Taille">
                    <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" placeholder="168 cm" className="field-input w-full py-2" />
                  </Field>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-[10px] bg-sage-tint px-3 py-2.5 text-[12.5px] font-semibold leading-snug text-sage-deep">
                  <Lock className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
                  Jamais partagé — même pas avec ton foyer.
                </div>
              </>
            )}
          </div>

          <button type="button" onClick={() => setStep('B')} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-green-strong text-base font-bold text-white" style={{ boxShadow: 'var(--shadow-md)' }}>
            Voir mes recommandations
            <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </section>
      )}

      {step === 'B' && (
        <section>
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex gap-1.5">
              <span className="h-1.5 w-[22px] rounded-full bg-green" />
              <span className="h-1.5 w-[22px] rounded-full bg-green" />
            </div>
            <button type="button" onClick={() => activate(false)} disabled={pending} className="text-sm font-bold text-ink-soft disabled:opacity-50">
              Passer
            </button>
          </div>
          <h1 className="font-display text-[27px] font-semibold leading-tight tracking-tight">Ton plan de suivi</h1>
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">
            Des idées d’après ce que tu as coché. Tu gardes la main sur tout, tout le temps.
          </p>

          {DEMO_RECOMMENDATIONS.map((rec) => {
            const kept = keptRecs.has(rec.id);
            return (
              <div key={rec.id} className={`mb-3 rounded-2xl border-[1.5px] bg-surface p-4 ${kept ? 'border-sage' : 'border-line'}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${TINT_BG[rec.tint]} text-sage-deep`}>
                    <rec.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <div className="text-[15.5px] font-bold">{rec.name}</div>
                  <span className="ml-auto rounded-full bg-butter-tint px-2.5 py-1 text-[11.5px] font-bold">{rec.badge}</span>
                </div>
                <p className="mb-2.5 text-[13px] leading-relaxed">
                  <b>Recommandé parce que tu as coché</b>{' '}
                  {rec.because.map((b, i) => (
                    <span key={b}>
                      <span className="rounded-full bg-sage-tint px-2 py-[1px] font-bold">{b}</span>
                      {i < rec.because.length - 1 ? ' + ' : '. '}
                    </span>
                  ))}
                  {rec.reason}
                </p>
                {rec.zone && kept && (
                  <div className="mb-3 flex flex-wrap items-center gap-2.5">
                    <span className="text-[13px] font-bold text-ink-soft">Ta zone :</span>
                    <input value={proteinMin} onChange={(e) => setProteinMin(e.target.value)} inputMode="numeric" className="field-input w-[76px] py-2 text-center font-bold" />
                    <span className="text-[13px] font-semibold text-ink-soft">à</span>
                    <input value={proteinMax} onChange={(e) => setProteinMax(e.target.value)} inputMode="numeric" className="field-input w-[76px] py-2 text-center font-bold" />
                    <span className="text-[13px] font-semibold text-ink-soft">{rec.zone.unit}</span>
                  </div>
                )}
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setKeptRecs((p) => new Set(p).add(rec.id))}
                    className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[14.5px] font-bold ${
                      kept ? 'bg-green-strong text-white' : 'border border-line bg-surface text-ink-soft'
                    }`}
                  >
                    <Check className="h-4 w-4" strokeWidth={1.75} />
                    {kept ? 'Suivi' : 'Suivre'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setKeptRecs((p) => {
                        const n = new Set(p);
                        n.delete(rec.id);
                        return n;
                      })
                    }
                    className={`h-11 flex-1 rounded-xl text-[14.5px] font-bold ${
                      kept ? 'border border-line bg-surface text-ink-soft' : 'bg-ink text-white'
                    }`}
                  >
                    Non merci
                  </button>
                </div>
              </div>
            );
          })}

          {error && <p className="mb-2 text-sm text-red-strong">{error}</p>}
          <button type="button" onClick={() => activate(true)} disabled={pending} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-green-strong text-base font-bold text-white disabled:opacity-60" style={{ boxShadow: 'var(--shadow-md)' }}>
            {pending ? 'Activation…' : `C’est parti — ${keptRecs.size} suivi${keptRecs.size > 1 ? 's' : ''}`}
            {!pending && <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          </button>
        </section>
      )}

      {step === 'C' && (
        <section className="pt-6 text-center">
          <div className="mx-auto mb-3.5 flex h-[150px] w-[150px] items-center justify-center rounded-full bg-sage-tint">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-20 w-20" aria-hidden="true" />
          </div>
          <div className="font-hand text-[22px] text-sage-deep">c’est tout bon !</div>
          <h1 className="mb-2 mt-1 font-display text-[27px] font-semibold leading-tight tracking-tight">Ton plan de suivi est prêt</h1>
          <p className="mx-auto mb-6 max-w-sm text-[14.5px] leading-relaxed text-ink-soft">
            Tes suivis se rempliront tout seuls depuis ton planning — rien d’autre à faire.
          </p>
          <div className="mb-4 rounded-2xl border border-line bg-surface p-[18px] text-left" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="mb-2.5 flex items-center gap-2.5 text-[15px] font-bold">
              <Percent className="h-[18px] w-[18px] text-sage-deep" strokeWidth={1.75} />
              Ta semaine est couverte à {coveragePct ?? 0} %
            </div>
            <div className="relative mb-2.5 h-3 rounded-full border border-line bg-paper">
              <div className="absolute bottom-[2px] left-[2px] top-[2px] rounded-full bg-butter" style={{ width: `${coveragePct ?? 0}%` }} />
            </div>
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {ingredientsWithData} ingrédient(s) sur {ingredientsTotal} ont des données nutritionnelles. Plus la
              couverture monte, plus tes repères sont justes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => start(async () => { await repairNutritionDataAction(); router.push('/nutrition'); })}
            disabled={pending}
            className="flex h-[52px] w-full items-center justify-center rounded-xl bg-green-strong text-base font-bold text-white disabled:opacity-60"
            style={{ boxShadow: 'var(--shadow-md)' }}
          >
            {pending ? 'Complétion…' : 'Compléter les données'}
          </button>
          <button type="button" onClick={() => router.push('/nutrition')} className="mt-3.5 text-[14.5px] font-bold text-ink-soft">
            Plus tard
          </button>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
