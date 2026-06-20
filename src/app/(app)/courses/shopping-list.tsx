'use client';

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DndContext, closestCenter, type CollisionDetection, type DragStartEvent, type DragOverEvent, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDndSensors } from '@/components/sortable';
import { ProductIcon, ProvenanceBadge, type ProvenanceKey } from '@/lib/product-assets';
import { UNIT_OPTIONS } from '@/lib/units';
import { RangerModal, BulkRangerModal, type CustomCategory } from './category-controls';
import { pushUndoToast } from './undo-toast';
import { useCoursesRefresh } from './courses-refresh';
import { catView } from './rayons';
import {
  toggleCheckAction,
  setFoodCategoryAction,
  updateManualItemAction,
  promoteToEssentialAction,
  removeLinesAction,
  undoRemoveLinesAction,
  bulkPromoteEssentialsAction,
  bulkSetCategoryAction,
  reorderRayonsAction,
  reorderShoppingLinesAction,
} from './actions';

type Source = 'recipe' | 'recurring' | 'manual';

export interface SLine {
  key: string;
  name: string;
  qty: string; // libellé d'affichage (« 1 L »)
  quantity: number | null; // valeur brute (pour l'édition)
  unit: string | null;
  sources: Source[]; // provenances fusionnées (repas / essentiel / ajouté)
  manualId: string | null; // article manuel unique (édition de la quantité)
  manualIds: string[]; // tous les articles manuels fusionnés (pour le retrait)
  manualOnly: boolean; // ligne 100 % manuelle → qté éditable + suppression réelle
  foodId: string | null;
  category: string | null;
  iconSlug: string | null;
  checked: boolean;
  alreadyStocked: boolean;
  stockedLabel: string | null;
}

export interface SGroup {
  key: string;
  label: string;
  tint: string;
  ink: string;
  iconSlug: string | null; // emblème (rayon custom)
  items: SLine[];
}

const SOURCE_TO_PROV: Record<Source, ProvenanceKey> = {
  recipe: 'repas',
  recurring: 'essentiel',
  manual: 'ajoute',
};

const OTHER_KEY = 'autres';

/** Normalisation pour la recherche (casse + accents neutralisés). */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Bascule coché/décoché. `onOptimistic(key)` (facultatif) retire la ligne de l'affichage
 * INSTANTANÉMENT (état optimiste) pendant que la révalidation serveur se fait en
 * arrière-plan → plus d'attente de 4 s avant que l'article ne bouge.
 */
function useToggle(onOptimistic?: (key: string) => void) {
  const [pending, startTransition] = useTransition();
  const [animating, setAnimating] = useState<Set<string>>(new Set());
  const refresh = useCoursesRefresh();

  function toggle(line: SLine, checked: boolean) {
    setAnimating((s) => new Set(s).add(line.key));
    startTransition(async () => {
      onOptimistic?.(line.key); // disparaît tout de suite (réconcilié à la révalidation)
      // État coché unifié par identité de ligne (cf. fusion inter-sources).
      const fd = new FormData();
      fd.set('checked', String(checked));
      fd.set('item_key', line.key);
      await toggleCheckAction(fd);
      // Recharge l'instantané AVANT de clore la transition → l'état optimiste se
      // réconcilie avec les données fraîches sans clignotement.
      await refresh();
      setAnimating((s) => {
        const n = new Set(s);
        n.delete(line.key);
        return n;
      });
    });
  }

  return { pending, animating, toggle };
}

/** Corbeille claire (bac à couvercle) — picto partagé pour les actions de suppression. */
export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
      <path d="M5.6 6 6.8 19.2A2 2 0 0 0 8.8 21h6.4a2 2 0 0 0 2-1.8L18.4 6" />
      <path d="M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

/** Petit bouton « retirer de la liste » (corbeille sur pastille rouge pâle, repérable). */
function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retirer de la liste"
      title="Retirer de la liste"
      className="flex h-7 w-7 items-center justify-center rounded-full bg-clay-tint/50 text-clay-deep transition-colors hover:bg-clay-tint"
    >
      <TrashIcon size={15} />
    </button>
  );
}

/**
 * Menu « ⋯ » d'actions d'une ligne, affiché UNIQUEMENT sur mobile (`lg:hidden`) pour
 * éviter de surcharger la rangée sur écran étroit : regroupe Essentiel / Ranger /
 * Retirer. Sur desktop, ces actions restent inline (cf. Row). Le menu se ferme au
 * clic extérieur ; la modale « Ranger » est rendue au niveau de la ligne (elle
 * survit donc à la fermeture du menu).
 */
function RowActionsMenu({
  isEssential,
  pinning,
  onPin,
  onRanger,
  onRemove,
}: {
  isEssential: boolean;
  pinning: boolean;
  onPin: () => void;
  onRanger: () => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sage-tint/50 disabled:opacity-50';
  return (
    <div ref={ref} className="relative lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Plus d’actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-sage-tint/50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-line bg-surface p-1 shadow-soft">
          <button
            type="button"
            role="menuitem"
            disabled={isEssential || pinning}
            onClick={() => {
              setOpen(false);
              onPin();
            }}
            className={`${item} text-amber-600`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={isEssential ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 17.3 6.2 20.6l1.1-6.5L2.5 9.5l6.5-.9L12 2.7l3 5.9 6.5.9-4.8 4.6 1.1 6.5z" />
            </svg>
            {isEssential ? 'Déjà un essentiel' : 'En faire un essentiel'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRanger();
            }}
            className={`${item} text-ink`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
            </svg>
            Ranger dans un rayon
          </button>
          {onRemove && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className={`${item} text-clay-deep`}
            >
              <TrashIcon size={16} />
              Retirer de la liste
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Ligne d'article (active ou « déjà pris »), avec coche/décoche animée. */
function Row({
  line,
  customCategories,
  mode,
  animating,
  pending,
  onToggle,
  dragHandle,
  flash,
  selectMode = false,
  selected = false,
  onSelectToggle,
  onRemove,
  sortableRef,
  sortableStyle,
  isDragging = false,
}: {
  line: SLine;
  customCategories: CustomCategory[];
  mode: 'active' | 'done';
  animating: boolean;
  pending: boolean;
  onToggle: () => void;
  dragHandle?: React.ReactNode;
  flash?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
  onRemove?: (line: SLine) => void;
  /** @dnd-kit : ref/style du nœud triable + état soulevé (fournis par SortableRow). */
  sortableRef?: (el: HTMLElement | null) => void;
  sortableStyle?: React.CSSProperties;
  isDragging?: boolean;
}) {
  const v = catView(line.category, customCategories);
  const tint = v?.tint ?? 'var(--color-sage-tint)';
  const ink = v?.ink ?? 'var(--color-sage-deep)';
  const done = mode === 'done';
  // Pendant l'animation, on montre l'état CIBLE (coché si on coche, vide si on décoche).
  const filled = animating ? mode === 'active' : done;

  // Édition de la quantité / unité : seulement les lignes 100 % manuelles
  // (une ligne fusionnée avec une recette/un essentiel n'est pas éditable à la main).
  const editable = line.manualOnly && line.manualId != null;
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [u, setU] = useState('');
  const [savingQty, startSave] = useTransition();

  // Modale « Ranger » contrôlée au niveau de la ligne (déclenchée par le chip desktop
  // OU le menu « ⋯ » mobile, et survit à la fermeture de ce menu).
  const [rangerOpen, setRangerOpen] = useState(false);

  // Épingle « essentiel » : la ligne devient un produit récurrent (revient tout seul).
  const [justPinned, setJustPinned] = useState(false);
  const [pinning, startPin] = useTransition();
  const isEssential = line.sources.includes('recurring') || justPinned;
  const refresh = useCoursesRefresh();
  function pin() {
    startPin(async () => {
      await promoteToEssentialAction({ label: line.name, foodId: line.foodId, quantity: line.quantity, unit: line.unit });
      setJustPinned(true);
      await refresh();
    });
  }

  function openEdit() {
    setQ(line.quantity != null ? String(line.quantity) : '');
    setU(line.unit ?? '');
    setEditing(true);
  }
  function saveQty() {
    const n = q.trim() === '' ? null : Number(q);
    startSave(async () => {
      await updateManualItemAction({
        id: line.manualId as string,
        quantity: n != null && !Number.isNaN(n) ? n : null,
        unit: u || null,
      });
      setEditing(false);
      await refresh();
    });
  }

  return (
    <li
      ref={sortableRef}
      data-food={line.foodId ?? undefined}
      style={{ ...(sortableStyle ?? {}), ...(!selectMode && !done ? { WebkitTouchCallout: 'none' } : {}) }}
      className={`flex items-center gap-3 rounded-lg px-1 py-2 transition-colors duration-200 hover:bg-sage-tint/40 ${animating ? 'opacity-40' : ''} ${selected ? 'bg-sage-tint/60' : ''} ${flash ? 'bg-sage-tint ring-1 ring-green-strong' : ''} ${isDragging ? 'relative bg-surface shadow-soft ring-1 ring-green-strong' : ''}`}
    >
      {selectMode ? (
        <button type="button" aria-label={selected ? 'Désélectionner' : 'Sélectionner'} onClick={onSelectToggle} className="block">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold transition-colors ${
              selected ? 'border-green-strong bg-green-strong text-white' : 'border-line-strong bg-surface text-transparent'
            }`}
          >
            ✓
          </span>
        </button>
      ) : (
        <button type="button" aria-label={done ? 'Décocher' : 'Cocher'} onClick={onToggle} disabled={pending} className="block">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold transition-colors ${
              filled ? 'border-green-strong bg-green-strong text-white' : 'border-line-strong bg-surface text-transparent'
            }`}
          >
            ✓
          </span>
        </button>
      )}

      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: tint, color: ink }}>
        <ProductIcon slug={line.iconSlug} size={20} />
      </span>

      {selectMode ? (
        <button type="button" onClick={onSelectToggle} className="min-w-0 flex-1 truncate text-left text-sm">
          {line.name}
        </button>
      ) : line.foodId ? (
        <Link
          href={`/courses/produit/${line.foodId}?from=/courses`}
          title="Voir la fiche produit"
          className={`min-w-0 flex-1 truncate text-sm hover:text-green-strong hover:underline ${done ? 'text-ink-soft line-through' : 'text-ink'}`}
        >
          {line.name}
        </Link>
      ) : (
        <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'text-ink-soft line-through' : ''}`}>{line.name}</span>
      )}

      <span className="flex shrink-0 items-center gap-2.5">
        {!selectMode && !done && line.alreadyStocked && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'var(--color-butter-tint)', color: '#8a6d1f' }}
            title="Tu as déjà cet article en stock"
          >
            {/* Compact sur mobile (gain de largeur), complet dès sm. */}
            <span className="sm:hidden">en stock</span>
            <span className="hidden sm:inline">déjà en stock{line.stockedLabel ? ` (${line.stockedLabel})` : ''}</span>
          </span>
        )}
        {/* Actions de ligne (desktop) : épingle essentiel, Ranger, retirer, glisser. */}
        {!selectMode && !done && (
          <span className="hidden items-center gap-2.5 lg:flex">
            <button
              type="button"
              onClick={pin}
              disabled={isEssential || pinning}
              aria-label={isEssential ? 'Déjà un essentiel' : 'Épingler comme essentiel'}
              title={isEssential ? 'Essentiel — gère-le dans « Mes essentiels »' : 'En faire un essentiel (reviendra tout seul)'}
              className={`${isEssential ? 'text-amber-500' : 'text-ink-soft/60 hover:text-amber-500'} disabled:cursor-default`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isEssential ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 17.3 6.2 20.6l1.1-6.5L2.5 9.5l6.5-.9L12 2.7l3 5.9 6.5.9-4.8 4.6 1.1 6.5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setRangerOpen(true)}
              className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft hover:border-green-strong hover:text-green-strong"
              title="Ranger dans un rayon"
            >
              Ranger
            </button>
          </span>
        )}
        {line.sources.map((s) => (
          <ProvenanceBadge key={s} kind={SOURCE_TO_PROV[s]} labelHiddenOnMobile />
        ))}
        {!selectMode && editable ? (
          editing ? (
            <span className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Qté"
                aria-label="Quantité"
                className="field-input w-16 px-2 py-1 text-sm"
              />
              <select
                value={u}
                onChange={(e) => setU(e.target.value)}
                aria-label="Unité"
                className="field-input w-[5.5rem] px-1 py-1 text-sm"
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={saveQty} disabled={savingQty} aria-label="Enregistrer" title="Enregistrer" className="text-green-strong disabled:opacity-60">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={openEdit}
              title="Modifier la quantité / l'unité"
              className={`text-sm text-ink-soft hover:text-ink hover:underline ${done ? 'line-through' : ''}`}
            >
              {line.qty || '+ qté'}
            </button>
          )
        ) : (
          line.qty && <span className={`text-sm text-ink-soft ${done ? 'line-through' : ''}`}>{line.qty}</span>
        )}
        {/* Retirer : desktop seulement (sur mobile, tout passe par le menu « ⋯ »). */}
        {!selectMode && !done && onRemove && (
          <span className="hidden items-center gap-2.5 lg:flex">
            <RemoveButton onClick={() => onRemove(line)} />
          </span>
        )}
        {/* Menu « ⋯ » : regroupe les actions sur mobile pour éviter les lignes surchargées. */}
        {!selectMode && !done && (
          <RowActionsMenu
            isEssential={isEssential}
            pinning={pinning}
            onPin={pin}
            onRanger={() => setRangerOpen(true)}
            onRemove={onRemove ? () => onRemove(line) : undefined}
          />
        )}
        {/* Poignée de glisser : toujours visible (desktop + mobile via appui long @dnd-kit). */}
        {!selectMode && !done && dragHandle}
      </span>

      {!selectMode && !done && rangerOpen && (
        <RangerModal
          label={line.name}
          foodId={line.foodId}
          currentCategory={line.category}
          currentIcon={line.iconSlug}
          customCategories={customCategories}
          onClose={() => setRangerOpen(false)}
        />
      )}
    </li>
  );
}

/** Bouton « vider le rayon » + confirmation en pop-over (cible de tap large, claire). */
function ViderRayon({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Vider le rayon ${label}`}
        title="Retirer tous les articles de ce rayon"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-clay-tint/50 text-clay-deep transition-colors hover:bg-clay-tint"
      >
        <TrashIcon size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-line bg-surface p-3 text-left shadow-soft">
          <p className="font-display text-sm font-semibold">Vider « {label} » ?</p>
          <p className="mt-0.5 text-xs font-normal text-ink-soft">Les articles seront retirés de ta liste — annulable.</p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className="btn-danger flex-1 py-2 text-sm"
            >
              Vider
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary py-2 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Collision @dnd-kit séparant les deux niveaux : un ARTICLE ne collisionne qu'avec des
 *  articles, un EN-TÊTE de rayon qu'avec des en-têtes (ids `grp:`) → on vise une ligne
 *  précise (pas la grande zone du rayon). */
const collisionStrategy: CollisionDetection = (args) => {
  const isGroup = String(args.active.id).startsWith('grp:');
  const containers = args.droppableContainers.filter((c) => String(c.id).startsWith('grp:') === isGroup);
  return closestCenter({ ...args, droppableContainers: containers });
};

const HandleSvg = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

/** Props communes passées du composant liste aux lignes/rayons triables. */
interface RowShared {
  customCategories: CustomCategory[];
  animatingSet: Set<string>;
  pending: boolean;
  toggle: (line: SLine, checked: boolean) => void;
  selectMode: boolean;
  selected: Set<string>;
  viewed: string | null;
  dragDisabled: boolean;
  onSelectToggle: (key: string) => void;
  onRemoveLine: (line: SLine) => void;
}

/** Ligne TRIABLE : le <li> de Row devient le nœud sortable, la poignée ⠿ porte les listeners. */
function SortableRow({ line, shared }: { line: SLine; shared: RowShared }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.key,
    disabled: shared.dragDisabled,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined };
  return (
    <Row
      line={line}
      customCategories={shared.customCategories}
      mode="active"
      animating={shared.animatingSet.has(line.key)}
      pending={shared.pending}
      flash={!!shared.viewed && line.foodId === shared.viewed}
      onToggle={() => shared.toggle(line, true)}
      selectMode={shared.selectMode}
      selected={shared.selected.has(line.key)}
      onSelectToggle={() => shared.onSelectToggle(line.key)}
      onRemove={(l) => shared.onRemoveLine(l)}
      sortableRef={setNodeRef}
      sortableStyle={style}
      isDragging={isDragging}
      dragHandle={
        <button
          type="button"
          aria-label="Glisser pour réordonner / changer de rayon"
          title="Glisser (appui long sur mobile)"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
        >
          {HandleSvg}
        </button>
      }
    />
  );
}

/** Rayon TRIABLE : en-tête (poignée = réordre des rayons) + liste triable des lignes. */
function SortableRayon({
  g,
  shared,
  collapsed,
  onToggleCollapse,
  onViderRayon,
}: {
  g: SGroup;
  shared: RowShared;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onViderRayon: () => void;
}) {
  const draggable = g.key !== OTHER_KEY;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `grp:${g.key}`,
    disabled: shared.dragDisabled || !draggable,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined };
  const itemKeys = useMemo(() => g.items.map((i) => i.key), [g.items]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-rayon={g.key}
      className={`relative rounded-lg border-t border-line first:border-t-0 ${isDragging ? 'shadow-soft ring-1 ring-green-strong' : ''}`}
    >
      <div className="flex items-center gap-1.5 py-2 font-display text-sm font-semibold">
        {draggable && !shared.selectMode && !shared.dragDisabled && (
          <button
            type="button"
            aria-label="Réordonner ce rayon"
            title="Glisser pour réordonner le rayon"
            {...attributes}
            {...listeners}
            className="flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-md text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
          >
            {HandleSvg}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Déplier le rayon' : 'Replier le rayon'}
          aria-expanded={!collapsed}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-sage-tint/50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="flex h-5 w-5 items-center justify-center rounded-md text-[10px]" style={{ background: g.tint, color: g.ink }}>
          {g.iconSlug ? <ProductIcon slug={g.iconSlug} size={12} /> : '●'}
        </span>
        <button type="button" onClick={onToggleCollapse} className="flex-1 truncate text-left">
          {g.label}
        </button>
        <span className="text-xs font-normal text-ink-soft">{g.items.length}</span>
        {!shared.selectMode && draggable && <ViderRayon label={g.label} onConfirm={onViderRayon} />}
      </div>
      {!collapsed && (
        <SortableContext items={itemKeys} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-line pl-1">
            {g.items.map((line) => (
              <SortableRow key={line.key} line={line} shared={shared} />
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}

/**
 * Liste « À acheter » : coche animée + glisser-déposer (appui long sur mobile, poignée
 * sur desktop) d'une tuile vers un rayon ET d'un rayon pour le réordonner ; rayons
 * repliables (chevron) ; retrait d'une ligne ou d'un rayon entier (avec annulation) ;
 * MULTI-SÉLECTION inter-rayons (ranger / essentiels / retirer).
 */
export function ShoppingList({
  groups: serverGroups,
  customCategories,
  rayonOrder = [],
}: {
  groups: SGroup[];
  customCategories: CustomCategory[];
  rayonOrder?: string[];
}) {
  // État OPTIMISTE de la liste : la coche fait disparaître la ligne tout de suite
  // (« hide »), le déplacement la fait changer de rayon tout de suite (« move »).
  // La révalidation serveur réconcilie ensuite — plus d'attente du round-trip.
  const sensors = useDndSensors();
  // Ordre affiché : source de vérité pendant un glisser, resynchronisé depuis le serveur
  // quand on ne glisse pas (synchro prop→état AU RENDU, pattern React, cf. Stock).
  const [board, setBoard] = useState<SGroup[]>(serverGroups);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [syncedServer, setSyncedServer] = useState(serverGroups);
  if (!activeId && serverGroups !== syncedServer) {
    setSyncedServer(serverGroups);
    setBoard(serverGroups);
  }
  const dragFromRayon = useRef<string | null>(null); // rayon d'origine d'un article glissé
  // Coche optimiste : la ligne disparaît tout de suite du board (réconciliée au refresh).
  const { pending, animating, toggle } = useToggle((key) =>
    setBoard((b) => b.map((g) => ({ ...g, items: g.items.filter((i) => i.key !== key) })).filter((g) => g.items.length > 0)),
  );
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Retrait (ligne / rayon / sélection) + multi-sélection + réordonnancement.
  const [, startRemove] = useTransition();
  const [bulkPending, startBulk] = useTransition();
  const [, startReorder] = useTransition();
  const refresh = useCoursesRefresh();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRanger, setBulkRanger] = useState(false);

  // Retour de la fiche produit : l'article consulté (?viewed=<foodId>) est mis en
  // valeur tant que le param est là, scrollé à vue, puis le param est retiré au bout
  // d'un moment (router.replace) → la surbrillance s'efface en fondu (transition).
  const viewed = useSearchParams().get('viewed');
  const router = useRouter();
  useEffect(() => {
    if (!viewed) return;
    document.querySelector(`[data-food="${viewed}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => router.replace('/courses', { scroll: false }), 1800);
    return () => clearTimeout(t);
  }, [viewed, router]);

  // Recherche : filtre les lignes par libellé (rayons vidés masqués). Le tri/DnD reste intact.
  const totalItems = board.reduce((n, g) => n + g.items.length, 0);
  const q = norm(query.trim());
  const dragDisabled = selectMode || q.length > 0;
  const shownGroups = q
    ? board.map((g) => ({ ...g, items: g.items.filter((l) => norm(l.name).includes(q)) })).filter((g) => g.items.length > 0)
    : board;

  const allLines = useMemo(() => board.flatMap((g) => g.items), [board]);
  const shownLines = useMemo(() => shownGroups.flatMap((g) => g.items), [shownGroups]);
  const selectedLines = useMemo(() => allLines.filter((l) => selected.has(l.key)), [allLines, selected]);
  const allShownSelected = shownLines.length > 0 && shownLines.every((l) => selected.has(l.key));

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }
  function toggleSelect(key: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }
  function toggleSelectAll() {
    setSelected(allShownSelected ? new Set() : new Set(shownLines.map((l) => l.key)));
  }
  function toggleCollapse(key: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  // Retire des lignes de la liste courante (manuel → suppression ; généré → masqué),
  // avec annulation. Mutualisé : ligne unique, rayon entier, sélection.
  function removeLines(lines: SLine[]) {
    if (lines.length === 0) return;
    const inputs = lines.map((l) => ({ key: l.key, manualIds: l.manualIds, dismiss: !l.manualOnly }));
    const label = lines.length === 1 ? `« ${lines[0].name} » retiré` : `${lines.length} articles retirés`;
    startRemove(async () => {
      const data = await removeLinesAction(inputs);
      pushUndoToast(label, async () => {
        await undoRemoveLinesAction(data);
        await refresh();
      });
      await refresh();
    });
  }

  function bulkEssentials() {
    const items = selectedLines.map((l) => ({ label: l.name, foodId: l.foodId, quantity: l.quantity, unit: l.unit }));
    startBulk(async () => {
      await bulkPromoteEssentialsAction(items);
      exitSelect();
      await refresh();
    });
  }
  function bulkDelete() {
    const lines = selectedLines;
    exitSelect();
    removeLines(lines);
  }
  async function bulkMove(categoryKey: string) {
    const items = selectedLines.map((l) => ({ label: l.name, foodId: l.foodId, iconSlug: l.iconSlug }));
    await bulkSetCategoryAction(items, categoryKey);
    exitSelect();
    await refresh();
  }

  // ----- Glisser-déposer @dnd-kit (parité Stock) : réordre d'une ligne dans son rayon,
  // déplacement entre rayons (change la catégorie), réordre des rayons par l'en-tête. -----
  const rayonSortableIds = useMemo(
    () => shownGroups.filter((g) => g.key !== OTHER_KEY).map((g) => `grp:${g.key}`),
    [shownGroups],
  );

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    dragFromRayon.current = id.startsWith('grp:') ? null : (board.find((g) => g.items.some((i) => i.key === id))?.key ?? null);
  }

  // Survol d'un AUTRE rayon : on y déplace la ligne en direct (le trou s'ouvre là-bas).
  // « Autres » n'est jamais une cible (on ne range pas dans le non-classé).
  function onDragOver(e: DragOverEvent) {
    const aId = String(e.active.id);
    if (aId.startsWith('grp:')) return;
    const oId = e.over ? String(e.over.id) : null;
    if (!oId || oId.startsWith('grp:') || oId === aId) return;
    setBoard((prev) => {
      const aRayon = prev.find((g) => g.items.some((i) => i.key === aId))?.key;
      const oRayon = prev.find((g) => g.items.some((i) => i.key === oId))?.key;
      if (aRayon == null || oRayon == null || aRayon === oRayon || oRayon === OTHER_KEY) return prev;
      const line = prev.find((g) => g.key === aRayon)!.items.find((i) => i.key === aId)!;
      const moved: SLine = { ...line, category: oRayon };
      return prev.map((g) => {
        if (g.key === aRayon) return { ...g, items: g.items.filter((i) => i.key !== aId) };
        if (g.key === oRayon) {
          const items = g.items.filter((i) => i.key !== aId);
          const idx = items.findIndex((i) => i.key === oId);
          items.splice(idx < 0 ? items.length : idx, 0, moved);
          return { ...g, items };
        }
        return g;
      });
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const aId = String(e.active.id);
    setActiveId(null);
    const oId = e.over ? String(e.over.id) : null;
    const cur = board;

    if (aId.startsWith('grp:')) {
      // Réordre des rayons dans l'ordre COMPLET du foyer (ses articles suivent).
      if (!oId || !oId.startsWith('grp:') || aId === oId) return;
      const aKey = aId.slice(4);
      const oKey = oId.slice(4);
      if (!rayonOrder.includes(aKey) || !rayonOrder.includes(oKey)) return;
      const keys = [...rayonOrder];
      const from = keys.indexOf(aKey);
      const to = keys.indexOf(oKey);
      if (from < 0 || to < 0 || from === to) return;
      const newKeys = arrayMove(keys, from, to);
      const idx = new Map(newKeys.map((k, i) => [k, i]));
      setBoard(
        [...cur].sort(
          (a, b) =>
            (idx.has(a.key) ? (idx.get(a.key) as number) : a.key === OTHER_KEY ? 2e9 : 1e9) -
            (idx.has(b.key) ? (idx.get(b.key) as number) : b.key === OTHER_KEY ? 2e9 : 1e9),
        ),
      );
      startReorder(async () => { await reorderRayonsAction(newKeys); await refresh(); });
      return;
    }

    // Article : il a pu changer de rayon (onDragOver). On le replace à la position du dépôt
    // dans son rayon courant, puis on persiste : catégorie (si changée) + ordre des lignes.
    const grp = cur.find((g) => g.items.some((i) => i.key === aId));
    if (!grp) return;
    let items = grp.items;
    if (oId && !oId.startsWith('grp:') && oId !== aId && items.some((i) => i.key === oId)) {
      const keys = items.map((i) => i.key);
      const from = keys.indexOf(aId);
      const to = keys.indexOf(oId);
      if (from >= 0 && to >= 0 && from !== to) {
        items = arrayMove(items, from, to);
        setBoard(cur.map((g) => (g.key === grp.key ? { ...g, items } : g)));
      }
    }
    const rayonKey = grp.key;
    const orderedKeys = items.map((i) => i.key);
    const line = items.find((i) => i.key === aId);
    const movedCategory = dragFromRayon.current != null && dragFromRayon.current !== rayonKey;
    dragFromRayon.current = null;
    startReorder(async () => {
      if (movedCategory && line && rayonKey !== OTHER_KEY) {
        await setFoodCategoryAction({ label: line.name, foodId: line.foodId, categoryKey: rayonKey, iconSlug: line.iconSlug });
      }
      await reorderShoppingLinesAction(orderedKeys);
      await refresh();
    });
  }

  const shared: RowShared = {
    customCategories,
    animatingSet: animating,
    pending,
    toggle,
    selectMode,
    selected,
    viewed,
    dragDisabled,
    onSelectToggle: toggleSelect,
    onRemoveLine: (l) => removeLines([l]),
  };

  return (
    <>
      {/* Barre d'outils : recherche + bascule sélection multiple. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {totalItems > 6 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un article…"
            aria-label="Rechercher dans la liste"
            className="field-input min-w-0 flex-1 px-3 py-1.5 text-sm"
          />
        )}
        {selectMode ? (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={toggleSelectAll} className="text-xs font-semibold text-green-strong">
              {allShownSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            <button type="button" onClick={exitSelect} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft">
              Terminé
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="ml-auto rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft hover:border-green-strong hover:text-green-strong"
          >
            Sélectionner
          </button>
        )}
      </div>

      {q && shownGroups.length === 0 && (
        <p className="py-4 text-center text-sm text-ink-soft">Aucun article ne correspond à « {query} ».</p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionStrategy}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={rayonSortableIds} strategy={verticalListSortingStrategy}>
          {shownGroups.map((g) => (
            <SortableRayon
              key={g.key}
              g={g}
              shared={shared}
              collapsed={collapsed.has(g.key)}
              onToggleCollapse={() => toggleCollapse(g.key)}
              onViderRayon={() => removeLines(g.items)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Barre d'actions de la sélection multiple (collante en bas, sombre pour ressortir). */}
      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
          <div
            className="flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-paper shadow-soft ring-1 ring-black/10"
            style={{ background: 'var(--color-ink)' }}
          >
            <span className="px-1 font-semibold">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
            <button type="button" onClick={bulkEssentials} disabled={bulkPending} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-semibold text-amber-300 ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-60">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 17.3 6.2 20.6l1.1-6.5L2.5 9.5l6.5-.9L12 2.7l3 5.9 6.5.9-4.8 4.6 1.1 6.5z" />
              </svg>
              Essentiels
            </button>
            <button type="button" onClick={() => setBulkRanger(true)} disabled={bulkPending} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-60">
              Ranger…
            </button>
            <button type="button" onClick={bulkDelete} disabled={bulkPending} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-clay-tint ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-60">
              Retirer
            </button>
          </div>
        </div>
      )}

      {bulkRanger && (
        <BulkRangerModal
          count={selected.size}
          customCategories={customCategories}
          onClose={() => setBulkRanger(false)}
          onPick={bulkMove}
        />
      )}
    </>
  );
}

/** Liste « Déjà pris » : décoche animée (la ligne repart instantanément vers « À acheter »). */
export function DoneList({ lines: serverLines, customCategories }: { lines: SLine[]; customCategories: CustomCategory[] }) {
  const [lines, hideOptimistic] = useOptimistic(serverLines, (ls: SLine[], key: string) => ls.filter((l) => l.key !== key));
  const { pending, animating, toggle } = useToggle(hideOptimistic);
  return (
    <ul className="divide-y divide-line">
      {lines.map((line) => (
        <Row
          key={line.key}
          line={line}
          customCategories={customCategories}
          mode="done"
          animating={animating.has(line.key)}
          pending={pending}
          onToggle={() => toggle(line, false)}
        />
      ))}
    </ul>
  );
}
