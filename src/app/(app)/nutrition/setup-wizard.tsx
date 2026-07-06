'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  PERSONAS,
  ACTIVITY_LEVELS,
  personaById,
  type PersonaId,
  type Sex,
  type ActivityLevel,
  type NutritionProfileData,
  type TargetZone,
  type GoalZone,
} from '@/lib/core/nutrition-profile';
import { computeTargetsAction, applyNutritionSetupAction } from './actions';

/**
 * N1 — panneau « Mon profil nutrition » : résumé (persona, nutriments suivis,
 * objectifs) + wizard de configuration en 3 écrans (persona → infos corporelles
 * OPTIONNELLES → cibles proposées MODIFIABLES). Les cibles proposées viennent du
 * serveur (référence curée / formule) — jamais inventées ici.
 */

interface BaseType {
  code: string;
  name: string;
  unit: string;
}

export function ProfilePanel({
  profile,
  goals,
  tracked,
  types,
}: {
  profile: NutritionProfileData | null;
  goals: GoalZone[];
  tracked: string[];
  types: BaseType[];
}) {
  const [open, setOpen] = useState(false);
  const persona = personaById(profile?.persona);

  if (open) {
    return <SetupWizard profile={profile} onClose={() => setOpen(false)} />;
  }

  if (!persona) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft xl:sticky xl:top-24">
        <h2 className="mb-2 font-display text-lg font-semibold">Mon profil nutrition</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Choisis un persona (Équilibre, Sportif, Enfant…) et obtiens des repères personnalisés — issus de
          références ANSES, jamais inventés. 2 minutes, tout est modifiable.
        </p>
        <button type="button" onClick={() => setOpen(true)} className="btn-primary mt-3 w-full py-2.5">
          Activer le suivi personnalisé
        </button>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Ton profil (persona, infos corporelles) reste strictement privé — invisible même pour ton foyer.
        </p>
      </section>
    );
  }

  const nameOf = (code: string) => types.find((t) => t.code === code)?.name ?? code;
  const unitOf = (code: string) => types.find((t) => t.code === code)?.unit ?? '';
  const zoneLabel = (g: GoalZone) =>
    g.min != null && g.max != null ? `${g.min}–${g.max}` : g.min != null ? `≥ ${g.min}` : g.max != null ? `≤ ${g.max}` : '—';

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft xl:sticky xl:top-24">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Mon profil nutrition</h2>
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary px-3 py-1.5 text-xs">
          Modifier
        </button>
      </div>
      <p className="text-sm">
        Persona : <span className="font-bold">{persona.label}</span>
      </p>
      {persona.child && (
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Mode enfant : variété et équilibre — les calories ne sont jamais affichées.
        </p>
      )}
      <div className="mt-3">
        <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Objectifs / jour</p>
        <ul className="mt-1.5 flex flex-col gap-1 text-sm">
          {goals.length === 0 && <li className="text-ink-soft">Aucun objectif enregistré.</li>}
          {goals
            .filter((g) => tracked.length === 0 || tracked.includes(g.code))
            // Défense en profondeur (éthique) : jamais de kcal sur un profil enfant,
            // même si un objectif énergie traîne d'une configuration précédente.
            .filter((g) => !(persona.child && g.code === 'energy_kcal'))
            .map((g) => (
              <li key={g.code} className="flex items-center justify-between gap-3">
                <span>{nameOf(g.code)}</span>
                <span className="font-bold">
                  {zoneLabel(g)} <span className="font-normal text-ink-soft">{unitOf(g.code)}</span>
                </span>
              </li>
            ))}
        </ul>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Repères indicatifs (références ANSES simplifiées) — ceci n’est pas un avis médical. Ton suivi reste privé
        par défaut.
      </p>
    </section>
  );
}

/* ------------------------------ Wizard ------------------------------ */

function SetupWizard({ profile, onClose }: { profile: NutritionProfileData | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);

  // Écran 1 : persona.
  const [personaId, setPersonaId] = useState<PersonaId | null>(profile?.persona ?? null);
  // Écran 2 : infos corporelles OPTIONNELLES.
  const [birthYear, setBirthYear] = useState(profile?.birthYear?.toString() ?? '');
  const [sex, setSex] = useState<Sex | ''>(profile?.sex ?? '');
  const [weightKg, setWeightKg] = useState(profile?.weightKg?.toString() ?? '');
  const [heightCm, setHeightCm] = useState(profile?.heightCm?.toString() ?? '');
  const [activity, setActivity] = useState<ActivityLevel | ''>(profile?.activityLevel ?? '');
  // Écran 3 : cibles proposées (modifiables) + nutriments suivis.
  const [zones, setZones] = useState<TargetZone[]>([]);
  const [trackedSet, setTrackedSet] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { min: string; max: string }>>({});

  const persona = personaById(personaId);
  const num = (s: string) => {
    const n = Number(s.replace(',', '.'));
    return s.trim() !== '' && !Number.isNaN(n) && n > 0 ? n : null;
  };

  const loadTargets = () => {
    if (!personaId) return;
    setError(null);
    startTransition(async () => {
      try {
        const z = await computeTargetsAction({
          persona: personaId,
          birthYear: num(birthYear),
          sex: sex || null,
          weightKg: num(weightKg),
          heightCm: num(heightCm),
          activityLevel: activity || null,
        });
        setZones(z);
        setTrackedSet(new Set(personaById(personaId)?.tracked ?? []));
        setEdits(
          Object.fromEntries(z.map((t) => [t.code, { min: t.min != null ? String(t.min) : '', max: t.max != null ? String(t.max) : '' }])),
        );
        setStep(3);
      } catch {
        setError('Impossible de calculer les cibles — réessaie.');
      }
    });
  };

  const apply = () => {
    if (!personaId) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await applyNutritionSetupAction({
          persona: personaId,
          birthYear: num(birthYear),
          sex: sex || null,
          weightKg: num(weightKg),
          heightCm: num(heightCm),
          activityLevel: activity || null,
          targets: zones.map((z) => ({ code: z.code, min: num(edits[z.code]?.min ?? ''), max: num(edits[z.code]?.max ?? '') })),
          tracked: Array.from(trackedSet),
        });
        if (!res.ok) throw new Error();
        onClose();
        router.refresh();
      } catch {
        setError('Enregistrement impossible — réessaie.');
      }
    });
  };

  const stepTitle = step === 1 ? 'Ton persona' : step === 2 ? 'Quelques infos (optionnel)' : 'Tes repères proposés';

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{stepTitle}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-soft">Étape {step}/3</span>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-sm text-ink-soft hover:bg-sage-tint/40" aria-label="Fermer">
            ✕
          </button>
        </div>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPersonaId(p.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                personaId === p.id ? 'border-green-strong bg-sage-tint/50' : 'border-line hover:bg-sage-tint/30'
              }`}
            >
              <span className="block text-sm font-bold">{p.label}</span>
              <span className="block text-xs leading-relaxed text-ink-soft">{p.description}</span>
            </button>
          ))}
          <button type="button" disabled={!personaId} onClick={() => setStep(2)} className="btn-primary mt-2 py-2.5 disabled:opacity-50">
            Continuer
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs leading-relaxed text-ink-soft">
            Tout est optionnel — ces infos affinent les repères (elles restent privées, invisibles pour ton
            foyer). Sans elles, on utilise des repères moyens par âge.
          </p>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Année de naissance</span>
            <input value={birthYear} onChange={(e) => setBirthYear(e.target.value)} inputMode="numeric" placeholder="1990" className="field-input w-28 py-1.5 text-right" />
          </label>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Sexe</span>
            <div className="flex gap-1.5">
              {([
                ['', '—'],
                ['female', 'Femme'],
                ['male', 'Homme'],
              ] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSex(v as Sex | '')}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${sex === v ? 'border-green-strong bg-sage-tint/60' : 'border-line text-ink-soft'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Poids (kg)</span>
            <input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} inputMode="decimal" placeholder="70" className="field-input w-28 py-1.5 text-right" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Taille (cm)</span>
            <input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} inputMode="decimal" placeholder="175" className="field-input w-28 py-1.5 text-right" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Activité</span>
            <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel | '')} className="field-input w-44 py-1.5">
              <option value="">—</option>
              {ACTIVITY_LEVELS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1 py-2.5">
              Retour
            </button>
            <button type="button" onClick={loadTargets} disabled={pending} className="btn-primary flex-1 py-2.5 disabled:opacity-50">
              {pending ? 'Calcul…' : 'Voir mes repères'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs leading-relaxed text-ink-soft">
            Repères issus de références ANSES simplifiées{persona?.child ? ' — mode enfant : pas de calories' : ''}.
            Coche ce que tu veux suivre, ajuste librement les valeurs.
          </p>
          <ul className="flex flex-col gap-1.5">
            {zones.map((z) => {
              const on = trackedSet.has(z.code);
              return (
                <li key={z.code} className={`rounded-xl border p-2.5 ${on ? 'border-line' : 'border-line/60 opacity-60'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const next = new Set(trackedSet);
                          if (e.target.checked) next.add(z.code);
                          else next.delete(z.code);
                          setTrackedSet(next);
                        }}
                      />
                      {z.name} <span className="font-normal text-ink-soft">({z.unit})</span>
                    </label>
                    <div className="flex items-center gap-1.5 text-xs">
                      <input
                        value={edits[z.code]?.min ?? ''}
                        onChange={(e) => setEdits({ ...edits, [z.code]: { min: e.target.value, max: edits[z.code]?.max ?? '' } })}
                        inputMode="decimal"
                        placeholder="min"
                        className="field-input w-16 py-1 text-right"
                      />
                      <span className="text-ink-soft">–</span>
                      <input
                        value={edits[z.code]?.max ?? ''}
                        onChange={(e) => setEdits({ ...edits, [z.code]: { min: edits[z.code]?.min ?? '', max: e.target.value } })}
                        inputMode="decimal"
                        placeholder="max"
                        className="field-input w-16 py-1 text-right"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {error && <p className="text-sm text-red-strong">{error}</p>}
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={() => setStep(2)} className="btn-secondary flex-1 py-2.5">
              Retour
            </button>
            <button type="button" onClick={apply} disabled={pending} className="btn-primary flex-1 py-2.5 disabled:opacity-50">
              {pending ? 'Enregistrement…' : 'Appliquer'}
            </button>
          </div>
        </div>
      )}
      {error && step !== 3 && <p className="mt-2 text-sm text-red-strong">{error}</p>}
    </section>
  );
}
