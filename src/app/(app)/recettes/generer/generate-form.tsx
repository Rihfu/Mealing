'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  addMissingToShoppingAction,
  generateRecipeAction,
  saveGeneratedRecipeAction,
  type GenerateState,
  type SaveDraftState,
} from './actions';
import type { RecipeDraft } from '@/lib/ai/generate-recipe';

/**
 * Génération de recette par IA — le brouillon est ÉDITABLE avant enregistrement
 * (nom, description, temps, portions, ingrédients, étapes, tags) : l'IA propose,
 * l'utilisateur garde la main. « Ajouter aux courses » n'emmène PLUS vers la
 * section Courses (le brouillon non enregistré serait perdu) : il confirme sur place.
 */

interface EditableIngredient {
  name: string;
  quantity: string;
  unit: string;
}

interface EditableDraft {
  name: string;
  description: string;
  prepTimeMin: string;
  cookTimeMin: string;
  servings: string;
  ingredients: EditableIngredient[];
  steps: string[];
  /** Tags séparés par des virgules (même convention que le formulaire recette). */
  tags: string;
}

const toEditable = (d: RecipeDraft): EditableDraft => ({
  name: d.name,
  description: d.description ?? '',
  prepTimeMin: d.prepTimeMin != null ? String(d.prepTimeMin) : '',
  cookTimeMin: d.cookTimeMin != null ? String(d.cookTimeMin) : '',
  servings: d.servings != null ? String(d.servings) : '1',
  ingredients: d.ingredients.map((i) => ({
    name: i.name,
    quantity: i.quantity != null ? String(i.quantity) : '',
    unit: i.unit ?? '',
  })),
  steps: [...d.steps],
  tags: d.tags.join(', '),
});

const num = (s: string): number | undefined => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && !Number.isNaN(n) && n >= 0 ? n : undefined;
};

/** Reconstruit un RecipeDraft propre (ingrédients/étapes vides filtrés) pour le save. */
const toDraft = (e: EditableDraft): RecipeDraft => ({
  name: e.name.trim(),
  description: e.description.trim(),
  prepTimeMin: num(e.prepTimeMin) != null ? Math.round(num(e.prepTimeMin)!) : undefined,
  cookTimeMin: num(e.cookTimeMin) != null ? Math.round(num(e.cookTimeMin)!) : undefined,
  servings: num(e.servings) && num(e.servings)! > 0 ? num(e.servings) : undefined,
  ingredients: e.ingredients
    .filter((i) => i.name.trim())
    .map((i) => ({ name: i.name.trim(), quantity: num(i.quantity), unit: i.unit.trim() })),
  steps: e.steps.map((s) => s.trim()).filter(Boolean),
  tags: e.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
});

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

export function GenerateForm() {
  const [state, formAction, pending] = useActionState<GenerateState | undefined, FormData>(
    generateRecipeAction,
    undefined,
  );
  const [edited, setEdited] = useState<EditableDraft | null>(null);
  const [shopPending, startShop] = useTransition();
  const [shopDone, setShopDone] = useState<string | null>(null);
  // Champ CONTRÔLÉ : React 19 réinitialise les formulaires non contrôlés après une
  // action — la demande serait perdue, alors qu'on veut pouvoir la retoucher
  // (« pareil mais sans lait ») et régénérer sans tout retaper.
  const [request, setRequest] = useState('');
  // Enregistrement À ÉTAT : une erreur revient ici (brouillon intact), pas d'écran d'erreur.
  const [saveState, saveAction, savePending] = useActionState<SaveDraftState | undefined, FormData>(
    saveGeneratedRecipeAction,
    undefined,
  );

  // Nouveau brouillon généré → on repart de sa version éditable (ajustement de
  // state PENDANT le rendu, pattern React officiel — pas d'effet en cascade).
  const [lastDraft, setLastDraft] = useState<RecipeDraft | undefined>(undefined);
  if (state?.draft !== lastDraft) {
    setLastDraft(state?.draft);
    setEdited(state?.draft ? toEditable(state.draft) : null);
    setShopDone(null);
  }

  const availability = state?.availability ?? [];
  const statusOf = (name: string) => availability.find((item) => norm(item.name) === norm(name));
  // Manquants ENCORE présents dans le brouillon édité (un ingrédient retiré ne part pas aux courses).
  const currentNames = new Set((edited?.ingredients ?? []).map((i) => norm(i.name)));
  const missing = availability.filter((item) => !item.covered && currentNames.has(norm(item.name)));

  const patch = (p: Partial<EditableDraft>) => setEdited((e) => (e ? { ...e, ...p } : e));
  const patchIngredient = (idx: number, p: Partial<EditableIngredient>) =>
    setEdited((e) =>
      e ? { ...e, ingredients: e.ingredients.map((i, k) => (k === idx ? { ...i, ...p } : i)) } : e,
    );

  const addToShopping = () =>
    startShop(async () => {
      try {
        const res = await addMissingToShoppingAction(missing);
        setShopDone(
          res.added > 0
            ? `${res.added} ingrédient(s) ajouté(s) à ta liste de courses — le brouillon reste ici, pense à l’enregistrer.`
            : 'Rien à ajouter.',
        );
      } catch {
        setShopDone('Ajout impossible — réessaie.');
      }
    });

  const savableDraft = edited ? toDraft(edited) : null;
  const canSave = !!savableDraft && savableDraft.name.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)] lg:items-start">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft lg:sticky lg:top-24">
        <h2 className="mb-3 font-display text-lg font-semibold">Demande</h2>
        <form action={formAction} className="flex flex-col gap-3">
          <textarea
            name="request"
            rows={8}
            required
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Ex. un curry de pois chiches rapide pour 4, végétarien, sans noix"
            className="field-input resize-none text-sm"
          />
          <button type="submit" disabled={pending} className="btn-primary py-3 disabled:opacity-50">
            {pending ? 'Génération...' : 'Générer'}
          </button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          L’IA structure la recette à partir de ta demande et de ton stock, mais ne fournit aucune valeur
          nutritionnelle.
        </p>
      </section>

      <section className="min-h-72 rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Aperçu</h2>
          {edited && <span className="pill bg-sage-tint text-sage-deep">brouillon IA — modifiable</span>}
        </div>

        {state?.error && <p className="text-sm text-red-strong">{state.error}</p>}

        {!edited && !state?.error && (
          <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-line-strong bg-paper/60 p-6 text-center text-sm text-ink-soft">
            Le brouillon apparaîtra ici avant enregistrement.
          </div>
        )}

        {edited && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <input
                value={edited.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Nom de la recette"
                className="field-input font-display text-2xl font-semibold"
                aria-label="Nom de la recette"
              />
              <textarea
                value={edited.description}
                onChange={(e) => patch({ description: e.target.value })}
                rows={2}
                placeholder="Description (optionnelle)"
                className="field-input resize-none text-sm"
                aria-label="Description"
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <label className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-ink-soft">Préparation</span>
                  <input value={edited.prepTimeMin} onChange={(e) => patch({ prepTimeMin: e.target.value })} inputMode="numeric" className="field-input w-16 py-1 text-right" />
                  <span className="text-xs text-ink-soft">min</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-ink-soft">Cuisson</span>
                  <input value={edited.cookTimeMin} onChange={(e) => patch({ cookTimeMin: e.target.value })} inputMode="numeric" className="field-input w-16 py-1 text-right" />
                  <span className="text-xs text-ink-soft">min</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-ink-soft">Portions</span>
                  <input value={edited.servings} onChange={(e) => patch({ servings: e.target.value })} inputMode="numeric" className="field-input w-14 py-1 text-right" />
                </label>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-extrabold text-ink">Ingrédients</h4>
                <ul className="flex flex-col gap-1.5">
                  {edited.ingredients.map((i, idx) => {
                    const status = i.name.trim() ? statusOf(i.name) : undefined;
                    return (
                      <li key={idx} className="flex items-center gap-1.5">
                        <input
                          value={i.name}
                          onChange={(e) => patchIngredient(idx, { name: e.target.value })}
                          placeholder="Ingrédient"
                          className="field-input min-w-0 flex-1 py-1.5 text-sm"
                          aria-label={`Ingrédient ${idx + 1}`}
                        />
                        {status && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              status.covered ? 'bg-sage-tint text-sage-deep' : 'bg-butter-tint text-ink-soft'
                            }`}
                          >
                            {status.covered ? 'stock' : 'à acheter'}
                          </span>
                        )}
                        <input
                          value={i.quantity}
                          onChange={(e) => patchIngredient(idx, { quantity: e.target.value })}
                          inputMode="decimal"
                          placeholder="Qté"
                          className="field-input w-16 py-1.5 text-right text-sm"
                          aria-label="Quantité"
                        />
                        <input
                          value={i.unit}
                          onChange={(e) => patchIngredient(idx, { unit: e.target.value })}
                          placeholder="unité"
                          className="field-input w-20 py-1.5 text-sm"
                          aria-label="Unité"
                        />
                        <button
                          type="button"
                          onClick={() => patch({ ingredients: edited.ingredients.filter((_, k) => k !== idx) })}
                          aria-label="Retirer l’ingrédient"
                          className="shrink-0 rounded-full px-1.5 text-ink-soft hover:text-red-strong"
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  onClick={() => patch({ ingredients: [...edited.ingredients, { name: '', quantity: '', unit: '' }] })}
                  className="mt-2 text-sm font-bold text-sage-deep hover:text-green-strong"
                >
                  + Ajouter un ingrédient
                </button>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-extrabold text-ink">Étapes</h4>
                <ol className="flex flex-col gap-2 text-sm">
                  {edited.steps.map((s, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="mt-1.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-sage-tint text-xs font-extrabold text-sage-deep">
                        {idx + 1}
                      </span>
                      <textarea
                        value={s}
                        onChange={(e) => patch({ steps: edited.steps.map((x, k) => (k === idx ? e.target.value : x)) })}
                        rows={2}
                        className="field-input min-w-0 flex-1 resize-none py-1.5 text-sm"
                        aria-label={`Étape ${idx + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => patch({ steps: edited.steps.filter((_, k) => k !== idx) })}
                        aria-label="Retirer l’étape"
                        className="mt-1.5 shrink-0 self-start rounded-full px-1.5 text-ink-soft hover:text-red-strong"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={() => patch({ steps: [...edited.steps, ''] })}
                  className="mt-2 text-sm font-bold text-sage-deep hover:text-green-strong"
                >
                  + Ajouter une étape
                </button>
              </div>
            </div>

            {missing.length > 0 && (
              <div className="rounded-xl border border-butter bg-butter-tint p-3 text-sm text-ink">
                <p className="font-extrabold">Ingrédients à prévoir</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Cette recette utilise aussi {missing.map((item) => item.name).join(', ')}. Tu peux les envoyer dans
                  les ajouts manuels de la liste de courses — tu resteras sur cette page.
                </p>
                {shopDone ? (
                  <p className="mt-3 rounded-lg bg-sage-tint px-3 py-2 text-xs font-bold text-sage-deep" role="status">
                    {shopDone}
                  </p>
                ) : (
                  <button type="button" onClick={addToShopping} disabled={shopPending} className="btn-secondary mt-3 py-2 disabled:opacity-50">
                    {shopPending ? 'Ajout…' : 'Ajouter aux courses'}
                  </button>
                )}
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-extrabold text-ink">Tags</span>
              <input
                value={edited.tags}
                onChange={(e) => patch({ tags: e.target.value })}
                placeholder="petit-déjeuner, rapide… (séparés par des virgules)"
                className="field-input py-1.5 text-sm"
              />
            </label>

            <p className="rounded-xl border border-butter bg-butter-tint p-3 text-xs leading-relaxed text-ink-soft">
              Les ingrédients sont reliés automatiquement au catalogue à l’enregistrement (calcul nutritionnel + suivi
              du stock). Tu pourras ajuster les liens en modifiant la recette.
            </p>

            <form action={saveAction}>
              <input type="hidden" name="draft" value={JSON.stringify(savableDraft)} />
              {saveState?.error && <p className="mb-2 text-sm font-semibold text-clay">{saveState.error}</p>}
              <button disabled={!canSave || savePending} className="btn-primary py-3 disabled:opacity-50">
                {savePending ? 'Enregistrement…' : 'Enregistrer cette recette'}
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
