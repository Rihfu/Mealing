'use client';

import { useActionState } from 'react';
import { generateRecipeAction, saveGeneratedRecipeAction, type GenerateState } from './actions';

export function GenerateForm() {
  const [state, formAction, pending] = useActionState<GenerateState | undefined, FormData>(
    generateRecipeAction,
    undefined,
  );
  const draft = state?.draft;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)] lg:items-start">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft lg:sticky lg:top-24">
        <h2 className="mb-3 font-display text-lg font-semibold">Demande</h2>
        <form action={formAction} className="flex flex-col gap-3">
          <textarea
            name="request"
            rows={8}
            required
            placeholder="Ex. un curry de pois chiches rapide pour 4, végétarien, sans noix"
            className="field-input resize-none text-sm"
          />
          <button type="submit" disabled={pending} className="btn-primary py-3 disabled:opacity-50">
            {pending ? 'Génération...' : 'Générer'}
          </button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          L’IA structure la recette, mais ne fournit aucune valeur nutritionnelle.
        </p>
      </section>

      <section className="min-h-72 rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Aperçu</h2>
          {draft && <span className="pill bg-sage-tint text-sage-deep">brouillon IA</span>}
        </div>

        {state?.error && <p className="text-sm text-red-strong">{state.error}</p>}

        {!draft && !state?.error && (
          <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-line-strong bg-paper/60 p-6 text-center text-sm text-ink-soft">
            Le brouillon apparaîtra ici avant enregistrement.
          </div>
        )}

        {draft && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="font-display text-2xl font-semibold">{draft.name}</h3>
              {draft.description && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{draft.description}</p>}
              <p className="mt-2 text-xs font-bold text-sage-deep">
                {(draft.prepTimeMin ?? 0) + (draft.cookTimeMin ?? 0)} min · {draft.servings ?? 1} portion(s)
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-extrabold text-ink">Ingrédients</h4>
                <ul className="divide-y divide-line rounded-xl border border-line bg-paper/50 px-3">
                  {draft.ingredients.map((i, idx) => (
                    <li key={idx} className="flex justify-between gap-3 py-2 text-sm">
                      <span>{i.name}</span>
                      <span className="font-bold">
                        {i.quantity ?? ''} {i.unit ?? ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {draft.steps.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-extrabold text-ink">Étapes</h4>
                  <ol className="flex flex-col gap-2 text-sm">
                    {draft.steps.map((s, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-sage-tint text-xs font-extrabold text-sage-deep">
                          {idx + 1}
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {draft.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.tags.map((t) => (
                  <span key={t} className="pill bg-sage-tint text-sage-deep">
                    {t}
                  </span>
                ))}
              </div>
            )}

            <p className="rounded-xl border border-butter bg-butter-tint p-3 text-xs leading-relaxed text-ink-soft">
              Les ingrédients sont enregistrés en texte libre. Lie-les à des aliments importés pour activer le calcul
              nutritionnel.
            </p>

            <form action={saveGeneratedRecipeAction}>
              <input type="hidden" name="draft" value={JSON.stringify(draft)} />
              <button className="btn-primary py-3">Enregistrer cette recette</button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
