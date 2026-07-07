'use client';

/**
 * États 5 + 6 du handoff — « Mes suivis » (onglets Suivis / Profil) et la feuille
 * « Mon repère à moi ».
 *
 * Branché sur du RÉEL : la liste des nutriments actifs (activer/mettre en pause,
 * éditer la zone, retirer) et les infos corporelles du profil (recalcul à
 * l'enregistrement) passent par applyNutritionSetupAction. Le CATALOGUE de repères
 * et le constructeur d'HABITUDE sont VISUELS (backend facettes/habitudes = N1.5).
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Check,
  Minus,
  Pencil,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { IconTile, nutrientVisual, zoneLabel } from '../ui';
import { FACET_GROUPS, DEMO_CATALOGUE, DEMO_SELECTED_FACETS, DEMO_BUILDER_TOPICS } from '../demo-data';
import { applyNutritionSetupAction, computeTargetsAction } from '../actions';
import type { PersonaId, Sex, ActivityLevel } from '@/lib/core/nutrition-profile';

interface ActiveItem {
  code: string;
  name: string;
  unit: string;
  min: number | null;
  max: number | null;
  on: boolean;
}

interface BodyInfo {
  birthYear: number | null;
  sex: Sex | null;
  weightKg: number | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
}

const TINT_BG = { sage: 'bg-sage-tint', butter: 'bg-butter-tint', clay: 'bg-clay-tint' } as const;

export function MesSuivis({
  persona,
  body,
  actives,
}: {
  persona: string;
  body: BodyInfo;
  actives: Array<Omit<ActiveItem, 'on'>>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'suivis' | 'profil'>('suivis');
  const [pending, start] = useTransition();
  const [items, setItems] = useState<ActiveItem[]>(actives.map((a) => ({ ...a, on: true })));
  const [editing, setEditing] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  // Infos corporelles (onglet Profil).
  const [birthYear, setBirthYear] = useState(body.birthYear?.toString() ?? '');
  const [sex, setSex] = useState<Sex | ''>(body.sex ?? '');
  const [weight, setWeight] = useState(body.weightKg?.toString() ?? '');
  const [height, setHeight] = useState(body.heightCm?.toString() ?? '');
  const [facets, setFacets] = useState<Set<string>>(new Set(DEMO_SELECTED_FACETS));

  const num = (s: string) => {
    const n = Number(s.replace(',', '.'));
    return s.trim() !== '' && !Number.isNaN(n) && n > 0 ? n : null;
  };

  /** Persiste la liste de suivis courante (tracked + zones) sans toucher au corps. */
  const persist = (next: ActiveItem[]) => {
    setItems(next);
    start(async () => {
      await applyNutritionSetupAction({
        persona: persona as PersonaId,
        birthYear: num(birthYear),
        sex: sex || null,
        weightKg: num(weight),
        heightCm: num(height),
        activityLevel: body.activityLevel,
        tracked: next.filter((i) => i.on).map((i) => i.code),
        targets: next.filter((i) => i.on).map((i) => ({ code: i.code, min: i.min, max: i.max })),
      });
      router.refresh();
    });
  };

  const saveProfile = () => {
    start(async () => {
      const b = { birthYear: num(birthYear), sex: sex || null, weightKg: num(weight), heightCm: num(height), activityLevel: body.activityLevel };
      // Recalcule les zones proposées à partir des nouvelles infos (garde les suivis actifs).
      const zones = await computeTargetsAction({ persona: persona as PersonaId, ...b });
      const zoneByCode = new Map(zones.map((z) => [z.code, z]));
      const next = items.map((i) => {
        const z = zoneByCode.get(i.code);
        return z ? { ...i, min: z.min, max: z.max } : i;
      });
      setItems(next);
      await applyNutritionSetupAction({
        persona: persona as PersonaId,
        ...b,
        tracked: next.filter((i) => i.on).map((i) => i.code),
        targets: next.filter((i) => i.on).map((i) => ({ code: i.code, min: i.min, max: i.max })),
      });
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-3 flex items-center gap-2.5">
        <Link href="/nutrition" aria-label="Retour" className="text-ink-soft hover:text-ink">
          <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </Link>
        <h1 className="font-display text-[22px] font-semibold tracking-tight">Mes suivis</h1>
        {pending && <span className="ml-auto text-xs text-ink-soft">Enregistrement…</span>}
      </div>

      <div className="mb-4 flex rounded-full border border-line bg-surface p-[3px]">
        {(['suivis', 'profil'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full py-2 text-center text-sm font-bold ${tab === t ? 'bg-sage-tint text-ink' : 'text-ink-soft'}`}
          >
            {t === 'suivis' ? 'Suivis' : 'Profil'}
          </button>
        ))}
      </div>

      {tab === 'suivis' ? (
        <>
          <div className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
            Actifs · {items.filter((i) => i.on).length}
          </div>
          <div className="flex flex-col gap-2.5">
            {items.map((item) => {
              const { Icon, tint } = nutrientVisual(item.code);
              const isEditing = editing === item.code;
              return (
                <div key={item.code} className={`rounded-2xl border border-line bg-surface p-3.5 ${item.on ? '' : 'opacity-70'}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
                  <div className="flex items-center gap-3">
                    <IconTile Icon={Icon} tint={tint} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-bold">{item.name}</div>
                      {item.on ? (
                        <button type="button" onClick={() => setEditing(isEditing ? null : item.code)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-sage-deep">
                          zone {zoneLabel(item.min, item.max)} {item.unit} / j
                          <Pencil className="h-3 w-3" strokeWidth={1.75} />
                        </button>
                      ) : (
                        <div className="text-xs font-semibold text-ink-soft">en pause — les données restent</div>
                      )}
                    </div>
                    <button type="button" onClick={() => persist(items.filter((i) => i.code !== item.code))} aria-label="Retirer" className="text-ink-soft hover:text-ink">
                      <Trash2 className="h-[17px] w-[17px]" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => persist(items.map((i) => (i.code === item.code ? { ...i, on: !i.on } : i)))}
                      aria-label={item.on ? 'Mettre en pause' : 'Réactiver'}
                      className={`relative h-7 w-[46px] shrink-0 rounded-full ${item.on ? 'bg-green' : 'bg-line'}`}
                    >
                      <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all ${item.on ? 'right-[3px]' : 'left-[3px]'}`} />
                    </button>
                  </div>
                  {isEditing && item.on && (
                    <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                      <span className="text-xs font-bold text-ink-soft">Zone</span>
                      <input
                        value={item.min?.toString() ?? ''}
                        onChange={(e) => setItems(items.map((i) => (i.code === item.code ? { ...i, min: num(e.target.value) } : i)))}
                        inputMode="decimal"
                        placeholder="min"
                        className="field-input w-20 py-1.5 text-center"
                      />
                      <span className="text-ink-soft">–</span>
                      <input
                        value={item.max?.toString() ?? ''}
                        onChange={(e) => setItems(items.map((i) => (i.code === item.code ? { ...i, max: num(e.target.value) } : i)))}
                        inputMode="decimal"
                        placeholder="max"
                        className="field-input w-20 py-1.5 text-center"
                      />
                      <span className="text-xs text-ink-soft">{item.unit}</span>
                      <button type="button" onClick={() => { setEditing(null); persist(items); }} className="ml-auto btn-primary px-3 py-1.5 text-xs">
                        OK
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {items.length === 0 && <p className="text-sm text-ink-soft">Aucun suivi actif — ajoute un repère du catalogue ci-dessous.</p>}
          </div>

          <div className="mb-2.5 mt-6 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Catalogue</div>
          <div className="mb-3 flex h-[46px] items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 text-sm font-semibold text-ink-soft">
            <Search className="h-[17px] w-[17px]" strokeWidth={1.75} />
            Chercher un repère…
          </div>
          {DEMO_CATALOGUE.map((c) => (
            <div key={c.id} className="mb-2.5 rounded-2xl border border-line bg-surface p-3.5" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="flex items-center gap-3">
                <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${TINT_BG[c.tint]} text-sage-deep`}>
                  <c.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[14.5px] font-bold">
                    {c.name}
                    {c.recommended && <span className="rounded-full bg-butter-tint px-2 py-[2px] text-[10px] font-bold">recommandé pour toi</span>}
                  </div>
                  <div className="text-xs leading-snug text-ink-soft">{c.description}</div>
                </div>
                <button type="button" onClick={() => setBuilderOpen(true)} aria-label="Ajouter" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-sage bg-surface text-green-strong">
                  <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
          <Link href="/assistant" className="mb-2.5 flex items-center gap-3 rounded-2xl border border-dashed border-line bg-paper p-3.5">
            <Sparkles className="h-[19px] w-[19px] shrink-0 text-sage-deep" strokeWidth={1.75} />
            <div className="flex-1 text-[13px] font-semibold leading-snug">
              Pas trouvé ce que tu cherches ?
              <div className="text-xs font-normal text-ink-soft">Demande à l’assistant — il peut créer un repère avec toi.</div>
            </div>
          </Link>
          <button type="button" onClick={() => setBuilderOpen(true)} className="flex h-[50px] w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-sage bg-surface text-[15px] font-bold text-sage-deep">
            <Plus className="h-[17px] w-[17px]" strokeWidth={1.75} />
            Créer mon propre repère
          </button>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-butter-tint px-3.5 py-2.5 text-[12.5px] font-semibold leading-snug">
            <Repeat className="h-[15px] w-[15px] shrink-0 text-sage-deep" strokeWidth={1.75} />
            Modifie tes réponses — tes recommandations se recalculent aussitôt.
          </div>
          {FACET_GROUPS.filter((g) => g.key !== 'alimentation').map((g) => (
            <div key={g.key} className="mb-4">
              <div className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-ink-soft">{g.title}</div>
              <div className="flex flex-wrap gap-2">
                {g.facets.map((f) => {
                  const on = facets.has(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        setFacets((prev) => {
                          const n = new Set(prev);
                          if (n.has(f.id)) n.delete(f.id);
                          else n.add(f.id);
                          return n;
                        })
                      }
                      className={`inline-flex h-[42px] items-center gap-1.5 rounded-full px-3.5 text-[13.5px] ${
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

          <div className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Mes repères affinés</div>
          <div className="rounded-2xl border border-line bg-surface p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="grid grid-cols-2 gap-2.5">
              <ProfileField label="Année de naissance">
                <input value={birthYear} onChange={(e) => setBirthYear(e.target.value)} inputMode="numeric" placeholder="1991" className="field-input w-full py-2" />
              </ProfileField>
              <ProfileField label="Sexe">
                <select value={sex} onChange={(e) => setSex(e.target.value as Sex | '')} className="field-input w-full py-2">
                  <option value="">—</option>
                  <option value="female">Femme</option>
                  <option value="male">Homme</option>
                </select>
              </ProfileField>
              <ProfileField label="Poids (kg)">
                <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="63" className="field-input w-full py-2" />
              </ProfileField>
              <ProfileField label="Taille (cm)">
                <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" placeholder="168" className="field-input w-full py-2" />
              </ProfileField>
            </div>
            <button type="button" onClick={saveProfile} disabled={pending} className="btn-primary mt-3 w-full py-2.5 disabled:opacity-60">
              {pending ? 'Recalcul…' : 'Enregistrer et recalculer'}
            </button>
            <p className="mt-2.5 flex items-center gap-2 text-[12px] font-semibold leading-snug text-sage-deep">
              🔒 Jamais partagé — même pas avec ton foyer.
            </p>
          </div>
        </>
      )}

      {builderOpen && <HabitBuilderSheet onClose={() => setBuilderOpen(false)} />}
    </div>
  );
}

function ProfileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

/* --------------------- État 6 — constructeur d'habitude --------------------- */

function HabitBuilderSheet({ onClose }: { onClose: () => void }) {
  const [dir, setDir] = useState<'min' | 'max'>('min');
  const [count, setCount] = useState(3);
  const [period, setPeriod] = useState<'week' | 'day'>('week');
  const [topic, setTopic] = useState(DEMO_BUILDER_TOPICS[0]);
  const [added, setAdded] = useState(false);

  const preview = `${topic}, ${dir === 'min' ? 'au moins' : 'au plus'} ${count} fois par ${period === 'week' ? 'semaine' : 'jour'}`;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl bg-paper p-6 sm:rounded-3xl"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-[5px] w-11 rounded-full bg-line sm:hidden" />
        <div className="mb-1 flex items-center justify-between">
          <div className="font-display text-[23px] font-semibold tracking-tight">Mon repère à moi</div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-ink-soft hover:text-ink">
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        <p className="mb-4 text-[13.5px] leading-snug text-ink-soft">Compté automatiquement depuis ton planning, comme les autres.</p>

        {added ? (
          <div className="rounded-2xl border border-line bg-surface p-5 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-sage-tint text-green-strong">
              <Check className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <p className="font-display text-lg font-semibold">Bientôt disponible</p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-soft">
              Les suivis d’habitudes arrivent avec la prochaine mise à jour — ton repère « {preview} » sera compté
              automatiquement depuis ton planning.
            </p>
            <button type="button" onClick={onClose} className="btn-primary mt-4 w-full py-2.5">
              Compris
            </button>
          </div>
        ) : (
          <>
            <div className="mb-2 text-[13px] font-bold text-ink-soft">1 · Plutôt…</div>
            <div className="mb-4 flex rounded-full border border-line bg-surface p-[3px]">
              {(['min', 'max'] as const).map((d) => (
                <button key={d} type="button" onClick={() => setDir(d)} className={`flex-1 rounded-full py-2.5 text-sm font-bold ${dir === d ? 'bg-sage-tint text-ink' : 'text-ink-soft'}`}>
                  {d === 'min' ? 'Au moins' : 'Au plus'}
                </button>
              ))}
            </div>

            <div className="mb-2 text-[13px] font-bold text-ink-soft">2 · Combien de fois</div>
            <div className="mb-4 flex items-center gap-3.5">
              <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} className="flex h-[46px] w-[46px] items-center justify-center rounded-xl border border-line bg-surface">
                <Minus className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <span className="min-w-9 text-center font-display text-[30px] font-semibold">{count}</span>
              <button type="button" onClick={() => setCount((c) => c + 1)} className="flex h-[46px] w-[46px] items-center justify-center rounded-xl border border-line bg-surface">
                <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <div className="flex flex-1 rounded-full border border-line bg-surface p-[3px]">
                {(['week', 'day'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPeriod(p)} className={`flex-1 rounded-full py-2.5 text-[13px] font-bold ${period === p ? 'bg-sage-tint text-ink' : 'text-ink-soft'}`}>
                    {p === 'week' ? 'par semaine' : 'par jour'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-2 text-[13px] font-bold text-ink-soft">3 · Ce qui compte</div>
            <div className="mb-2 flex flex-wrap gap-2">
              {DEMO_BUILDER_TOPICS.map((t) => {
                const on = topic === t;
                return (
                  <button key={t} type="button" onClick={() => setTopic(t)} className={`inline-flex h-[42px] items-center gap-1.5 rounded-full px-3.5 text-[13.5px] ${on ? 'border-[1.5px] border-green bg-sage-tint font-bold' : 'border border-line bg-surface font-semibold'}`}>
                    {t}
                    {on && <Check className="h-3.5 w-3.5 text-green-strong" strokeWidth={1.75} />}
                  </button>
                );
              })}
            </div>
            <p className="mb-4 text-[12.5px] font-semibold text-ink-soft">yaourt, kéfir, choucroute, miso…</p>

            <div className="mb-4 flex items-center gap-2.5 rounded-2xl bg-butter-tint px-4 py-3">
              <Check className="h-[17px] w-[17px] shrink-0 text-sage-deep" strokeWidth={1.75} />
              <span className="font-hand text-[21px] text-ink">{preview}</span>
            </div>
            <button type="button" onClick={() => setAdded(true)} className="flex h-[52px] w-full items-center justify-center rounded-xl bg-green-strong text-base font-bold text-white" style={{ boxShadow: 'var(--shadow-md)' }}>
              Ajouter à mes suivis
            </button>
          </>
        )}
      </div>
    </div>
  );
}
