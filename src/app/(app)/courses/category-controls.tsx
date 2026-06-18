'use client';

import { useState, useTransition } from 'react';
import { CATEGORY_ORDER, CATEGORIES, PRODUCTS, CATEGORY_ICONS, ProductIcon } from '@/lib/product-assets';
import {
  setFoodCategoryAction,
  clearFoodCategoryAction,
  createCategoryAction,
  deleteCategoryAction,
} from './actions';

export interface CustomCategory {
  id: string;
  label: string;
  tint: string | null;
  iconSlug: string | null;
}

const TINTS = [
  { label: 'Vert', val: 'var(--color-sage-tint)' },
  { label: 'Beurre', val: 'var(--color-butter-tint)' },
  { label: 'Terracotta', val: 'var(--color-clay-tint)' },
];

const BUILTINS = CATEGORY_ORDER.map((key) => ({ key, ...CATEGORIES[key] }));

/** Jeton de rayon sélectionnable. */
function RayonChip({
  label,
  tint,
  active,
  onClick,
}: {
  label: string;
  tint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        active ? 'border-green-strong ring-1 ring-green-strong' : 'border-line'
      }`}
    >
      <span className="h-3 w-3 rounded-full" style={{ background: tint }} />
      {label}
    </button>
  );
}

/** Grille d'icônes (banque d'assets) pour choisir le picto d'un article ou d'un rayon. */
function IconGrid({
  value,
  onPick,
  icons = PRODUCTS,
}: {
  value: string | null;
  onPick: (slug: string | null) => void;
  icons?: ReadonlyArray<{ key: string; label: string }>;
}) {
  return (
    <div className="grid max-h-40 grid-cols-7 gap-1 overflow-auto rounded-xl border border-line p-2">
      <button
        type="button"
        onClick={() => onPick(null)}
        className={`flex h-9 items-center justify-center rounded-lg text-xs text-ink-soft ${
          value == null ? 'bg-sage-tint ring-1 ring-green-strong' : ''
        }`}
        title="Aucune"
      >
        —
      </button>
      {icons.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPick(p.key)}
          title={p.label}
          className={`flex h-9 items-center justify-center rounded-lg ${
            value === p.key ? 'bg-sage-tint ring-1 ring-green-strong' : 'hover:bg-sage-tint/40'
          }`}
        >
          <ProductIcon slug={p.key} size={20} />
        </button>
      ))}
    </div>
  );
}

/**
 * Bouton « Ranger » d'une ligne de courses : ouvre une modale pour déplacer
 * l'article dans un rayon (intégré ou personnalisé), choisir son icône, ou créer
 * un nouveau rayon. Le choix est mémorisé par foyer (re-proposé/reclassé ensuite).
 */
export function RangerButton({
  label,
  foodId,
  currentCategory,
  currentIcon,
  customCategories,
}: {
  label: string;
  foodId: string | null;
  currentCategory: string | null;
  currentIcon: string | null;
  customCategories: CustomCategory[];
}) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<string | null>(currentCategory);
  const [icon, setIcon] = useState<string | null>(currentIcon);
  const [pending, startTransition] = useTransition();

  // Création de rayon (inline).
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newTint, setNewTint] = useState(TINTS[2].val);
  const [newIcon, setNewIcon] = useState<string | null>(null);

  function openModal() {
    setCat(currentCategory);
    setIcon(currentIcon);
    setCreating(false);
    setNewLabel('');
    setNewIcon(null);
    setOpen(true);
  }

  function save(categoryKey: string | null, iconSlug: string | null) {
    startTransition(async () => {
      await setFoodCategoryAction({ label, foodId, categoryKey, iconSlug });
      setOpen(false);
    });
  }

  function reset() {
    startTransition(async () => {
      await clearFoodCategoryAction(label);
      setOpen(false);
    });
  }

  function createAndAssign() {
    const lbl = newLabel.trim();
    if (!lbl) return;
    startTransition(async () => {
      const id = await createCategoryAction({ label: lbl, iconSlug: newIcon, tint: newTint });
      if (id) await setFoodCategoryAction({ label, foodId, categoryKey: id, iconSlug: icon });
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft hover:border-green-strong hover:text-green-strong"
        title="Ranger dans un rayon"
      >
        Ranger
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(40,38,34,0.32)' }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-auto rounded-2xl border border-line bg-surface p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold">
              Ranger « {label} »
            </h3>
            <p className="mt-0.5 text-sm text-ink-soft">
              Choisis un rayon. On s’en souviendra pour la prochaine fois.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {BUILTINS.map((b) => (
                <RayonChip key={b.key} label={b.label} tint={b.tint} active={cat === b.key} onClick={() => setCat(b.key)} />
              ))}
              {customCategories.map((c) => (
                <RayonChip
                  key={c.id}
                  label={c.label}
                  tint={c.tint ?? 'var(--color-clay-tint)'}
                  active={cat === c.id}
                  onClick={() => setCat(c.id)}
                />
              ))}
            </div>

            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-2 text-xs font-semibold text-green-strong"
              >
                ＋ Nouveau rayon
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-line p-3">
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Nom du rayon (ex. Plats préparés)"
                  className="field-input w-full"
                />
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-xs text-ink-soft">Couleur&nbsp;:</span>
                  {TINTS.map((t) => (
                    <button
                      key={t.val}
                      type="button"
                      onClick={() => setNewTint(t.val)}
                      className={`h-6 w-6 rounded-full border ${newTint === t.val ? 'ring-2 ring-green-strong' : 'border-line'}`}
                      style={{ background: t.val }}
                      title={t.label}
                    />
                  ))}
                </div>
                <p className="mt-2 mb-1 text-xs text-ink-soft">Icône du rayon</p>
                <IconGrid value={newIcon} onPick={setNewIcon} icons={CATEGORY_ICONS} />
                <button
                  type="button"
                  onClick={createAndAssign}
                  disabled={pending || !newLabel.trim()}
                  className="btn-secondary mt-2 py-2 text-xs disabled:opacity-60"
                >
                  Créer et y ranger
                </button>
              </div>
            )}

            <h4 className="mt-4 font-display text-sm font-semibold">Icône de l’article</h4>
            <div className="mt-1.5">
              <IconGrid value={icon} onPick={setIcon} />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => save(cat, icon)}
                disabled={pending}
                className="btn-primary flex-1 py-2.5 disabled:opacity-60"
              >
                {pending ? 'On range…' : 'Enregistrer'}
              </button>
              {currentCategory && (
                <button type="button" onClick={reset} disabled={pending} className="btn-secondary py-2.5 text-xs">
                  Réinitialiser
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="px-2 text-sm text-ink-soft">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Aside « Mes rayons » : liste les rayons personnalisés du foyer + création/suppression. */
export function MyAisles({ customCategories }: { customCategories: CustomCategory[] }) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [tint, setTint] = useState(TINTS[2].val);
  const [picking, setPicking] = useState(false);

  function create() {
    const lbl = label.trim();
    if (!lbl) return;
    startTransition(async () => {
      await createCategoryAction({ label: lbl, iconSlug: icon, tint });
      setLabel('');
      setIcon(null);
      setPicking(false);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteCategoryAction(id);
    });
  }

  return (
    <div className="text-sm">
      <ul className="mb-3 divide-y divide-line">
        {customCategories.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2">
            <span className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: c.tint ?? 'var(--color-clay-tint)' }}
              >
                <ProductIcon slug={c.iconSlug} size={16} />
              </span>
              {c.label}
            </span>
            <button
              type="button"
              onClick={() => remove(c.id)}
              disabled={pending}
              className="text-xs font-semibold text-clay-deep hover:underline"
            >
              supprimer
            </button>
          </li>
        ))}
        {customCategories.length === 0 && (
          <li className="py-2 text-sm text-ink-soft">Aucun rayon personnalisé pour l’instant.</li>
        )}
      </ul>

      <div className="flex flex-col gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nouveau rayon (ex. Plats préparés)"
          className="field-input"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line"
            title="Choisir une icône"
          >
            <ProductIcon slug={icon} size={18} />
          </button>
          {TINTS.map((t) => (
            <button
              key={t.val}
              type="button"
              onClick={() => setTint(t.val)}
              className={`h-6 w-6 rounded-full border ${tint === t.val ? 'ring-2 ring-green-strong' : 'border-line'}`}
              style={{ background: t.val }}
              title={t.label}
            />
          ))}
          <button type="button" onClick={create} disabled={pending || !label.trim()} className="btn-secondary ml-auto py-2 text-xs disabled:opacity-60">
            Ajouter
          </button>
        </div>
        {picking && <IconGrid value={icon} onPick={(s) => setIcon(s)} icons={CATEGORY_ICONS} />}
      </div>
    </div>
  );
}
