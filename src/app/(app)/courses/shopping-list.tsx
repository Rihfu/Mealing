'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductIcon, ProvenanceBadge, type ProvenanceKey } from '@/lib/product-assets';
import { UNIT_OPTIONS } from '@/lib/units';
import { RangerModal, BulkRangerModal, type CustomCategory } from './category-controls';
import { pushUndoToast } from './undo-toast';
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

/** Construit/maj l'ensemble des lignes « en cours d'animation » de bascule. */
function useToggle() {
  const [pending, startTransition] = useTransition();
  const [animating, setAnimating] = useState<Set<string>>(new Set());

  function toggle(line: SLine, checked: boolean) {
    setAnimating((s) => new Set(s).add(line.key));
    startTransition(async () => {
      // État coché unifié par identité de ligne (cf. fusion inter-sources).
      const fd = new FormData();
      fd.set('checked', String(checked));
      fd.set('item_key', line.key);
      await toggleCheckAction(fd);
      setAnimating((s) => {
        const n = new Set(s);
        n.delete(line.key);
        return n;
      });
    });
  }

  return { pending, animating, toggle };
}

/** Petit bouton « retirer de la liste » (corbeille). */
function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retirer de la liste"
      title="Retirer de la liste"
      className="text-ink-soft/70 hover:text-clay-deep"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18M8 6V4h8v2m-1 0v14H9V6" />
      </svg>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4h8v2m-1 0v14H9V6" />
              </svg>
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
  onPressStart,
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
  /** Démarre l'armement d'un appui long (mobile) pour glisser la tuile vers un rayon. */
  onPressStart?: (e: React.PointerEvent) => void;
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
  function pin() {
    startPin(async () => {
      await promoteToEssentialAction({ label: line.name, foodId: line.foodId, quantity: line.quantity, unit: line.unit });
      setJustPinned(true);
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
    });
  }

  return (
    <li
      data-food={line.foodId ?? undefined}
      onPointerDown={!selectMode && !done ? onPressStart : undefined}
      className={`flex items-center gap-3 rounded-lg px-1 py-2 transition-all duration-200 hover:bg-sage-tint/40 ${animating ? 'opacity-40' : ''} ${selected ? 'bg-sage-tint/60' : ''} ${flash ? 'bg-sage-tint ring-1 ring-green-strong' : ''}`}
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
        {/* Retirer + glisser : desktop seulement (sur mobile, tout passe par le menu « ⋯ »). */}
        {!selectMode && !done && onRemove && (
          <span className="hidden items-center gap-2.5 lg:flex">
            <RemoveButton onClick={() => onRemove(line)} />
            {dragHandle}
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
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft/70 hover:bg-clay-tint/40 hover:text-clay-deep"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18M8 6V4h8v2m-1 0v14H9V6" />
        </svg>
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

type DragState =
  | { kind: 'item'; line: SLine; from: string }
  | { kind: 'rayon'; key: string; label: string; tint: string; ink: string; iconSlug: string | null }
  | null;

/**
 * Liste « À acheter » : coche animée + glisser-déposer (appui long sur mobile, poignée
 * sur desktop) d'une tuile vers un rayon ET d'un rayon pour le réordonner ; rayons
 * repliables (chevron) ; retrait d'une ligne ou d'un rayon entier (avec annulation) ;
 * MULTI-SÉLECTION inter-rayons (ranger / essentiels / retirer).
 */
export function ShoppingList({
  groups,
  customCategories,
  rayonOrder = [],
}: {
  groups: SGroup[];
  customCategories: CustomCategory[];
  rayonOrder?: string[];
}) {
  const { pending, animating, toggle } = useToggle();
  const [drag, setDrag] = useState<DragState>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [overKey, setOverKey] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);
  const justDragged = useRef(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Retrait (ligne / rayon / sélection) + multi-sélection + réordonnancement.
  const [, startRemove] = useTransition();
  const [bulkPending, startBulk] = useTransition();
  const [, startReorder] = useTransition();
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
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const q = norm(query.trim());
  const shownGroups = q
    ? groups.map((g) => ({ ...g, items: g.items.filter((l) => norm(l.name).includes(q)) })).filter((g) => g.items.length > 0)
    : groups;

  const allLines = useMemo(() => groups.flatMap((g) => g.items), [groups]);
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
      pushUndoToast(label, () => undoRemoveLinesAction(data));
    });
  }

  function bulkEssentials() {
    const items = selectedLines.map((l) => ({ label: l.name, foodId: l.foodId, quantity: l.quantity, unit: l.unit }));
    startBulk(async () => {
      await bulkPromoteEssentialsAction(items);
      exitSelect();
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
  }

  // Appui long générique (tactile + souris) : déclenche `activate` si on maintient
  // l'appui ~350 ms sans bouger ; un déplacement (scroll) ou un relâchement annule.
  function armLongPress(e: React.PointerEvent, activate: () => void) {
    if (e.button != null && e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const clear = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - sy) > 8) {
        moved = true;
        clear();
      }
    };
    const onEnd = () => clear();
    const timer = window.setTimeout(() => {
      clear();
      if (!moved) activate();
    }, 350);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }

  function startItemDrag(line: SLine, from: string, x: number, y: number) {
    justDragged.current = true;
    overRef.current = null;
    setOverKey(null);
    setPos({ x, y });
    setDrag({ kind: 'item', line, from });
  }
  function startRayonDrag(g: SGroup, x: number, y: number, e?: React.PointerEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    justDragged.current = true;
    overRef.current = null;
    setOverKey(null);
    setPos({ x, y });
    setDrag({ kind: 'rayon', key: g.key, label: g.label, tint: g.tint, ink: g.ink, iconSlug: g.iconSlug });
  }

  useEffect(() => {
    if (!drag) return;
    // Pendant un glisser, on neutralise le scroll/sélection natifs (tactile inclus).
    const prevTouch = document.body.style.touchAction;
    const prevSelect = document.body.style.userSelect;
    document.body.style.touchAction = 'none';
    document.body.style.userSelect = 'none';
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
      const sec = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-rayon]') as HTMLElement | null;
      const k = sec?.dataset.rayon ?? null;
      overRef.current = k;
      setOverKey(k);
    };
    const onUp = () => {
      const target = overRef.current;
      const d = drag;
      if (!d) return;
      setDrag(null);
      setOverKey(null);
      overRef.current = null;
      if (d.kind === 'item') {
        if (target && target !== d.from && target !== OTHER_KEY) {
          setFoodCategoryAction({ label: d.line.name, foodId: d.line.foodId, categoryKey: target, iconSlug: d.line.iconSlug });
        }
      } else if (
        target &&
        target !== d.key &&
        target !== OTHER_KEY &&
        rayonOrder.includes(d.key) &&
        rayonOrder.includes(target)
      ) {
        // Réordonne le rayon dans l'ordre COMPLET du foyer (ses articles suivent).
        const without = rayonOrder.filter((k) => k !== d.key);
        const ti = without.indexOf(target);
        const movingDown = rayonOrder.indexOf(d.key) < rayonOrder.indexOf(target);
        without.splice(movingDown ? ti + 1 : ti, 0, d.key);
        startReorder(() => reorderRayonsAction(without));
      }
      // Laisse le clic de fin de glisser se résoudre avant de réautoriser le toggle.
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      document.body.style.touchAction = prevTouch;
      document.body.style.userSelect = prevSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, rayonOrder]);

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
      {shownGroups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        const itemOver = overKey === g.key && drag?.kind === 'item' && drag.from !== g.key;
        const rayonOver = overKey === g.key && drag?.kind === 'rayon' && drag.key !== g.key;
        const isDraggingThis = drag?.kind === 'rayon' && drag.key === g.key;
        const draggable = g.key !== OTHER_KEY;
        return (
          <div
            key={g.key}
            data-rayon={g.key}
            className={`rounded-lg border-t border-line first:border-t-0 ${itemOver ? 'bg-sage-tint/40 ring-1 ring-green-strong' : ''} ${rayonOver ? 'ring-2 ring-green-strong' : ''} ${isDraggingThis ? 'opacity-40' : ''}`}
          >
            <div className="flex items-center gap-1.5 py-2 font-display text-sm font-semibold">
              <button
                type="button"
                onClick={() => toggleCollapse(g.key)}
                aria-label={isCollapsed ? 'Déplier le rayon' : 'Replier le rayon'}
                aria-expanded={!isCollapsed}
                className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-sage-tint/50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <span className="flex h-5 w-5 items-center justify-center rounded-md text-[10px]" style={{ background: g.tint, color: g.ink }}>
                {g.iconSlug ? <ProductIcon slug={g.iconSlug} size={12} /> : '●'}
              </span>
              {/* Le libellé bascule le repli au tap ; appui long (mobile) = glisser le rayon. */}
              <button
                type="button"
                onClick={() => {
                  if (justDragged.current) return;
                  toggleCollapse(g.key);
                }}
                onPointerDown={draggable && !selectMode ? (e) => armLongPress(e, () => startRayonDrag(g, e.clientX, e.clientY)) : undefined}
                className="flex-1 truncate text-left"
              >
                {g.label}
              </button>
              <span className="text-xs font-normal text-ink-soft">{g.items.length}</span>
              {!selectMode && draggable && <ViderRayon label={g.label} onConfirm={() => removeLines(g.items)} />}
              {!selectMode && draggable && (
                <button
                  type="button"
                  aria-label="Réordonner ce rayon"
                  title="Glisser pour réordonner le rayon"
                  onPointerDown={(e) => startRayonDrag(g, e.clientX, e.clientY, e)}
                  className="hidden h-7 w-7 cursor-grab items-center justify-center rounded-md text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing lg:flex"
                  style={{ touchAction: 'none' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.5" />
                    <circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" />
                    <circle cx="15" cy="18" r="1.5" />
                  </svg>
                </button>
              )}
            </div>
            {!isCollapsed && (
              <ul className="divide-y divide-line pl-1">
                {g.items.map((line) => (
                  <Row
                    key={line.key}
                    line={line}
                    customCategories={customCategories}
                    mode="active"
                    animating={animating.has(line.key)}
                    pending={pending}
                    flash={!!viewed && line.foodId === viewed}
                    onToggle={() => toggle(line, true)}
                    selectMode={selectMode}
                    selected={selected.has(line.key)}
                    onSelectToggle={() => toggleSelect(line.key)}
                    onRemove={(l) => removeLines([l])}
                    onPressStart={(e) => armLongPress(e, () => startItemDrag(line, g.key, e.clientX, e.clientY))}
                    dragHandle={
                      <button
                        type="button"
                        aria-label="Déplacer vers un rayon"
                        title="Glisser pour déplacer de rayon"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startItemDrag(line, g.key, e.clientX, e.clientY);
                        }}
                        className="cursor-grab text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
                        style={{ touchAction: 'none' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="9" cy="6" r="1.5" />
                          <circle cx="15" cy="6" r="1.5" />
                          <circle cx="9" cy="12" r="1.5" />
                          <circle cx="15" cy="12" r="1.5" />
                          <circle cx="9" cy="18" r="1.5" />
                          <circle cx="15" cy="18" r="1.5" />
                        </svg>
                      </button>
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {drag && (
        <div
          className="pointer-events-none fixed z-[60] flex items-center gap-2 rounded-xl border border-green-strong bg-surface px-3 py-2 text-sm font-semibold shadow-soft"
          style={{ left: pos.x + 12, top: pos.y - 8, transform: 'rotate(-2deg)' }}
        >
          {drag.kind === 'item' ? (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'var(--color-sage-tint)', color: 'var(--color-sage-deep)' }}>
                <ProductIcon slug={drag.line.iconSlug} size={18} />
              </span>
              {drag.line.name}
            </>
          ) : (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: drag.tint, color: drag.ink }}>
                {drag.iconSlug ? <ProductIcon slug={drag.iconSlug} size={16} /> : '●'}
              </span>
              {drag.label}
            </>
          )}
        </div>
      )}

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

/** Liste « Déjà pris » : décoche animée (la pastille se vide avant le retour). */
export function DoneList({ lines, customCategories }: { lines: SLine[]; customCategories: CustomCategory[] }) {
  const { pending, animating, toggle } = useToggle();
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
