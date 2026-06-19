'use client';

import { useState, useTransition } from 'react';
import {
  CATEGORY_ORDER,
  CATEGORIES,
  PRODUCTS,
  CATEGORY_ICONS,
  RAYON_PALETTE,
  ProductIcon,
  categoryDef,
} from '@/lib/product-assets';
import { normalizeLabel } from '@/lib/text';
import {
  setFoodCategoryAction,
  clearFoodCategoryAction,
  createCategoryAction,
  deleteCategoryAction,
  moveRayonAction,
} from './actions';

export interface CustomCategory {
  id: string;
  label: string;
  tint: string | null;
  iconSlug: string | null;
}

const DEFAULT_TINT = RAYON_PALETTE[0].tint;
const BUILTINS = CATEGORY_ORDER.map((key) => ({ key, ...CATEGORIES[key] }));

/** Pastilles de couleur (palette de rayons). */
function ColorSwatches({ value, onPick }: { value: string; onPick: (tint: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RAYON_PALETTE.map((c) => (
        <button
          key={c.tint}
          type="button"
          onClick={() => onPick(c.tint)}
          className={`h-7 w-7 rounded-full border ${value === c.tint ? 'ring-2 ring-green-strong' : 'border-line'}`}
          style={{ background: c.tint }}
          title={c.label}
          aria-label={c.label}
        />
      ))}
    </div>
  );
}

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

/** Coque de modale (overlay + carte arrondie à scroll intérieur). */
function Modal({ onClose, pending, children }: { onClose: () => void; pending: boolean; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(40,38,34,0.32)' }}
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[85vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Modale « Ranger » d'une ligne de courses (CONTRÔLÉE : le parent gère l'ouverture).
 * Déplace l'article dans un rayon (intégré ou personnalisé), choisit son icône, ou
 * crée un rayon. Le choix est mémorisé par foyer. Contrôlée pour être déclenchée
 * indifféremment depuis le chip « Ranger » (desktop) ou le menu « ⋯ » (mobile) —
 * et survivre à la fermeture de ce menu (elle est rendue au niveau de la ligne).
 */
export function RangerModal({
  label,
  foodId,
  currentCategory,
  currentIcon,
  customCategories,
  onClose,
}: {
  label: string;
  foodId: string | null;
  currentCategory: string | null;
  currentIcon: string | null;
  customCategories: CustomCategory[];
  onClose: () => void;
}) {
  const [cat, setCat] = useState<string | null>(currentCategory);
  const [icon, setIcon] = useState<string | null>(currentIcon);
  const [pending, startTransition] = useTransition();

  // Création de rayon (inline).
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newTint, setNewTint] = useState(DEFAULT_TINT);
  const [newIcon, setNewIcon] = useState<string | null>(null);

  function save(categoryKey: string | null, iconSlug: string | null) {
    startTransition(async () => {
      await setFoodCategoryAction({ label, foodId, categoryKey, iconSlug });
      onClose();
    });
  }

  function reset() {
    startTransition(async () => {
      await clearFoodCategoryAction(label);
      onClose();
    });
  }

  function createAndAssign() {
    const lbl = newLabel.trim();
    if (!lbl) return;
    startTransition(async () => {
      const id = await createCategoryAction({ label: lbl, iconSlug: newIcon, tint: newTint });
      if (id) await setFoodCategoryAction({ label, foodId, categoryKey: id, iconSlug: icon });
      onClose();
    });
  }

  return (
    <Modal onClose={onClose} pending={pending}>
      <h3 className="font-display text-lg font-semibold">Ranger « {label} »</h3>
      <p className="mt-0.5 text-sm text-ink-soft">Choisis un rayon. On s’en souviendra pour la prochaine fois.</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {BUILTINS.map((b) => (
          <RayonChip key={b.key} label={b.label} tint={b.tint} active={cat === b.key} onClick={() => setCat(b.key)} />
        ))}
        {customCategories.map((c) => (
          <RayonChip
            key={c.id}
            label={c.label}
            tint={c.tint ?? DEFAULT_TINT}
            active={cat === c.id}
            onClick={() => setCat(c.id)}
          />
        ))}
      </div>

      {!creating ? (
        <button type="button" onClick={() => setCreating(true)} className="mt-2 text-xs font-semibold text-green-strong">
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
          <p className="mb-1 mt-2 text-xs text-ink-soft">Couleur</p>
          <ColorSwatches value={newTint} onPick={setNewTint} />
          <p className="mb-1 mt-2 text-xs text-ink-soft">Icône du rayon</p>
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
        <button type="button" onClick={onClose} disabled={pending} className="px-2 text-sm text-ink-soft">
          Annuler
        </button>
      </div>
    </Modal>
  );
}

/**
 * Modale de rangement GROUPÉ (multi-sélection) : choisir/créer un rayon pour
 * déplacer plusieurs articles d'un coup. Renvoie la clé de rayon retenue via
 * `onPick` (l'appelant applique le déplacement aux articles sélectionnés).
 */
export function BulkRangerModal({
  count,
  customCategories,
  onClose,
  onPick,
}: {
  count: number;
  customCategories: CustomCategory[];
  onClose: () => void;
  onPick: (categoryKey: string) => Promise<void> | void;
}) {
  const [cat, setCat] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newTint, setNewTint] = useState(DEFAULT_TINT);
  const [newIcon, setNewIcon] = useState<string | null>(null);

  function apply(key: string) {
    startTransition(async () => {
      await onPick(key);
      onClose();
    });
  }
  function createAndApply() {
    const lbl = newLabel.trim();
    if (!lbl) return;
    startTransition(async () => {
      const id = await createCategoryAction({ label: lbl, iconSlug: newIcon, tint: newTint });
      if (id) await onPick(id);
      onClose();
    });
  }

  return (
    <Modal onClose={onClose} pending={pending}>
      <h3 className="font-display text-lg font-semibold">
        Ranger {count} article{count > 1 ? 's' : ''}
      </h3>
      <p className="mt-0.5 text-sm text-ink-soft">Choisis le rayon où les déplacer (on s’en souviendra).</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {BUILTINS.map((b) => (
          <RayonChip key={b.key} label={b.label} tint={b.tint} active={cat === b.key} onClick={() => setCat(b.key)} />
        ))}
        {customCategories.map((c) => (
          <RayonChip
            key={c.id}
            label={c.label}
            tint={c.tint ?? DEFAULT_TINT}
            active={cat === c.id}
            onClick={() => setCat(c.id)}
          />
        ))}
      </div>

      {!creating ? (
        <button type="button" onClick={() => setCreating(true)} className="mt-2 text-xs font-semibold text-green-strong">
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
          <p className="mb-1 mt-2 text-xs text-ink-soft">Couleur</p>
          <ColorSwatches value={newTint} onPick={setNewTint} />
          <p className="mb-1 mt-2 text-xs text-ink-soft">Icône du rayon</p>
          <IconGrid value={newIcon} onPick={setNewIcon} icons={CATEGORY_ICONS} />
          <button
            type="button"
            onClick={createAndApply}
            disabled={pending || !newLabel.trim()}
            className="btn-secondary mt-2 py-2 text-xs disabled:opacity-60"
          >
            Créer et y ranger
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => cat && apply(cat)}
          disabled={pending || !cat}
          className="btn-primary flex-1 py-2.5 disabled:opacity-60"
        >
          {pending ? 'On range…' : 'Ranger ici'}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className="px-2 text-sm text-ink-soft">
          Annuler
        </button>
      </div>
    </Modal>
  );
}

/** Petite ligne réordonnable de la liste « Ordre des rayons » (flèches haut/bas). */
function ReorderRow({
  rayonKey,
  label,
  tint,
  isFirst,
  isLast,
  pending,
  onMove,
}: {
  rayonKey: string;
  label: string;
  tint: string;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  onMove: (key: string, dir: 'up' | 'down') => void;
}) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tint }} />
      <span className="flex-1 truncate text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onMove(rayonKey, 'up')}
        disabled={pending || isFirst}
        aria-label="Monter"
        title="Monter"
        className="rounded-md border border-line p-1 text-ink-soft hover:border-green-strong hover:text-green-strong disabled:opacity-30"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onMove(rayonKey, 'down')}
        disabled={pending || isLast}
        aria-label="Descendre"
        title="Descendre"
        className="rounded-md border border-line p-1 text-ink-soft hover:border-green-strong hover:text-green-strong disabled:opacity-30"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </li>
  );
}

/**
 * Bouton « ＋ Ajouter un rayon » (placé en bas de « À acheter ») : ouvre une
 * mini-fenêtre pour RÉORDONNER les rayons (ordre du mode magasin), créer un rayon
 * personnalisé (nom + couleur + icône) et gérer (supprimer) les rayons existants.
 */
export function ManageAislesButton({
  customCategories,
  rayonOrder = [],
}: {
  customCategories: CustomCategory[];
  rayonOrder?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [tint, setTint] = useState(DEFAULT_TINT);
  const [icon, setIcon] = useState<string | null>(null);

  // Libellé + teinte d'un rayon (intégré ou custom) pour la liste de réordonnancement.
  const customById = new Map(customCategories.map((c) => [c.id, c]));
  const rayonInfo = (key: string): { label: string; tint: string } => {
    const def = categoryDef(key);
    if (def) return { label: def.label, tint: def.tint };
    const c = customById.get(key);
    return { label: c?.label ?? 'Rayon', tint: c?.tint ?? DEFAULT_TINT };
  };
  function move(key: string, dir: 'up' | 'down') {
    startTransition(async () => {
      await moveRayonAction({ key, dir });
    });
  }

  // Anti-doublon : un rayon prédéfini OU custom porte déjà ce nom → inutile de le recréer.
  const norm = normalizeLabel(label);
  const dup = norm
    ? BUILTINS.find((b) => normalizeLabel(b.label) === norm) ??
      customCategories.find((c) => normalizeLabel(c.label) === norm) ??
      null
    : null;

  function create() {
    const lbl = label.trim();
    if (!lbl || dup) return;
    startTransition(async () => {
      await createCategoryAction({ label: lbl, iconSlug: icon, tint });
      setLabel('');
      setIcon(null);
      setTint(DEFAULT_TINT);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteCategoryAction(id);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-green-strong hover:border-green-strong hover:bg-sage-tint/30"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Ajouter un rayon
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} pending={pending}>
          <h3 className="font-display text-lg font-semibold">Rayons</h3>

          {/* Ordre des rayons : l'utilisateur range les rayons dans l'ordre de SON
              magasin → la liste et le mode magasin suivent ce parcours. */}
          {rayonOrder.length > 0 && (
            <div className="mt-3 rounded-xl border border-line p-3">
              <h4 className="font-display text-sm font-semibold">Ordre des rayons</h4>
              <p className="mt-0.5 text-xs text-ink-soft">
                Range-les dans l’ordre de ton magasin — ta liste et le mode magasin suivront ce parcours.
              </p>
              <ul className="mt-2 divide-y divide-line">
                {rayonOrder.map((key, i) => {
                  const info = rayonInfo(key);
                  return (
                    <ReorderRow
                      key={key}
                      rayonKey={key}
                      label={info.label}
                      tint={info.tint}
                      isFirst={i === 0}
                      isLast={i === rayonOrder.length - 1}
                      pending={pending}
                      onMove={move}
                    />
                  );
                })}
              </ul>
            </div>
          )}

          {/* Rayons prédéfinis : déjà disponibles, inutile de les recréer. On les
              montre d'abord pour éviter les doublons (« Viande » existe déjà). */}
          <p className="mt-4 text-sm text-ink-soft">
            Ces rayons existent déjà — pour y ranger un article, utilise « Ranger » sur sa ligne.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {BUILTINS.map((b) => (
              <span
                key={b.key}
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft"
              >
                <span className="h-3 w-3 rounded-full" style={{ background: b.tint }} />
                {b.label}
              </span>
            ))}
          </div>

          <h4 className="mt-5 font-display text-sm font-semibold">Créer un rayon perso</h4>
          <p className="mt-0.5 text-sm text-ink-soft">
            Seulement si aucun rayon ci-dessus ne convient (plats préparés, végétal…).
          </p>

          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nom du rayon"
            className="field-input mt-3 w-full"
          />
          {dup && (
            <p className="mt-1.5 text-xs font-semibold text-clay-deep">
              « {dup.label} » existe déjà — inutile de le recréer, range tes articles dedans avec « Ranger ».
            </p>
          )}
          <p className="mb-1 mt-3 text-xs text-ink-soft">Couleur</p>
          <ColorSwatches value={tint} onPick={setTint} />
          <p className="mb-1 mt-3 text-xs text-ink-soft">Icône</p>
          <IconGrid value={icon} onPick={setIcon} icons={CATEGORY_ICONS} />

          <button
            type="button"
            onClick={create}
            disabled={pending || !label.trim() || !!dup}
            className="btn-primary mt-4 w-full py-2.5 disabled:opacity-60"
          >
            {pending ? 'On crée…' : 'Créer le rayon'}
          </button>

          {customCategories.length > 0 && (
            <>
              <h4 className="mt-5 font-display text-sm font-semibold">Mes rayons</h4>
              <ul className="mt-1 divide-y divide-line text-sm">
                {customCategories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-lg"
                        style={{ background: c.tint ?? DEFAULT_TINT }}
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
              </ul>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="mt-4 w-full py-2 text-sm text-ink-soft"
          >
            Fermer
          </button>
        </Modal>
      )}
    </>
  );
}
