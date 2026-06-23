'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RecipeSortBy, GroupSortBy } from '@/lib/core';
import {
  DndContext,
  closestCenter,
  useDroppable,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDndSensors } from '@/components/sortable';
import { TrashIcon } from '../courses/shopping-list';
import { sectionKey, type RecipeGroupSection, type RecipeTile } from './groups';
import {
  createGroupAction,
  renameGroupAction,
  deleteGroupAction,
  reorderGroupsAction,
  reorderRecipesAction,
  bulkMoveRecipesAction,
  bulkDeleteRecipesAction,
  removeRecipeAction,
  sortRecipesAction,
  sortGroupsAction,
} from './actions';

const RECIPE_SORTS: Array<{ by: RecipeSortBy; label: string }> = [
  { by: 'alpha', label: 'A → Z' },
  { by: 'added', label: 'Récemment ajoutées' },
  { by: 'modified', label: 'Récemment modifiées' },
  { by: 'frequency', label: 'Plus utilisées' },
  { by: 'stock', label: 'Réalisable (stock)' },
];
const GROUP_SORTS: Array<{ by: GroupSortBy; label: string }> = [
  { by: 'count', label: 'Le plus rempli' },
  { by: 'alpha', label: 'A → Z' },
];

/** Menu « Trier ▾ » (ferme au clic extérieur). Réutilisé en barre du haut (global, avec
 *  les groupes) et dans la barre de sélection (recettes cochées seulement). */
function SortMenu({
  triggerClass,
  includeGroups,
  dropUp,
  onSortRecipes,
  onSortGroups,
}: {
  triggerClass: string;
  includeGroups?: boolean;
  dropUp?: boolean;
  onSortRecipes: (by: RecipeSortBy) => void;
  onSortGroups?: (by: GroupSortBy) => void;
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

  const item = 'flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-sage-tint/50';
  const head = 'px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft';
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" className={triggerClass}>
        Trier ▾
      </button>
      {open && (
        <div className={`absolute right-0 z-40 w-56 rounded-xl border border-line bg-surface p-1 text-left shadow-soft ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <p className={`${head} pt-1.5`}>Recettes</p>
          {RECIPE_SORTS.map((s) => (
            <button key={s.by} type="button" className={item} onClick={() => { setOpen(false); onSortRecipes(s.by); }}>
              {s.label}
            </button>
          ))}
          {includeGroups && onSortGroups && (
            <>
              <p className={`${head} mt-1 border-t border-line pt-2`}>Groupes</p>
              {GROUP_SORTS.map((s) => (
                <button key={s.by} type="button" className={item} onClick={() => { setOpen(false); onSortGroups(s.by); }}>
                  {s.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const HandleIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);
const PencilIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
const ForkIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 2v7a3 3 0 0 0 6 0V2M10 9v13M17 2c-1.5 0-3 1.8-3 5s1.5 4 3 4 3-.8 3-4-1.5-5-3-5Zm0 13v7" /></svg>
);

/** Détection de collision : sépare le drag d'en-tête (grp:) du drag de tuile (tuiles +
 *  zones de dépôt grp-drop:), pour ne pas mélanger les deux niveaux (cf. Stock). */
const collisionStrategy: CollisionDetection = (args) => {
  const isGroup = String(args.active.id).startsWith('grp:');
  const containers = args.droppableContainers.filter((c) => String(c.id).startsWith('grp:') === isGroup);
  return closestCenter({ ...args, droppableContainers: containers });
};

/** Poubelle rouge à confirmation en place (action irréversible). */
function TileTrash({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <button type="button" onClick={onConfirm} className="rounded-full bg-clay px-2 py-1 text-[11px] font-semibold text-white">Oui</button>
        <button type="button" onClick={() => setConfirming(false)} aria-label="Annuler" className="rounded-full bg-line/60 px-2 py-1 text-[11px] font-semibold text-ink-soft">✕</button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label="Supprimer la recette"
      title="Supprimer la recette"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-clay-tint/60 text-[#c2774f] transition-colors hover:bg-clay-tint"
    >
      <TrashIcon size={15} />
    </button>
  );
}

function RecipeTileBody({
  r,
  selectMode,
  selected,
  onSelectToggle,
  onDelete,
  handle,
}: {
  r: RecipeTile;
  selectMode: boolean;
  selected: boolean;
  onSelectToggle: () => void;
  onDelete: () => void;
  handle?: React.ReactNode;
}) {
  const total = (r.prepTimeMin ?? 0) + (r.cookTimeMin ?? 0);
  return (
    <>
      {selectMode && (
        <button type="button" aria-label={selected ? 'Désélectionner' : 'Sélectionner'} onClick={onSelectToggle}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold ${selected ? 'border-green-strong bg-green-strong text-white' : 'border-line-strong bg-surface text-transparent'}`}>✓</span>
        </button>
      )}
      {r.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL signée éphémère (bucket privé)
        <img src={r.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-tint text-sage-deep">{ForkIcon}</span>
      )}
      {selectMode ? (
        <button type="button" onClick={onSelectToggle} className="min-w-0 flex-1 truncate text-left">
          <span className="block truncate text-sm font-medium">{r.name}</span>
          <span className="text-xs text-ink-soft">{total} min · {r.servings} port.</span>
        </button>
      ) : (
        <Link href={`/recettes/${r.id}`} className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink hover:text-sage-deep">{r.name}</span>
          <span className="text-xs text-ink-soft">{total} min · {r.servings} port.</span>
        </Link>
      )}
      {!selectMode && r.isOwner && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Link href={`/recettes/${r.id}/modifier`} aria-label="Modifier" title="Modifier" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sage-tint/60 hover:text-sage-deep">{PencilIcon}</Link>
          <TileTrash onConfirm={onDelete} />
        </div>
      )}
      {handle}
    </>
  );
}

function SortableRecipeTile({
  r,
  selectMode,
  selected,
  dragDisabled,
  onSelectToggle,
  onDelete,
}: {
  r: RecipeTile;
  selectMode: boolean;
  selected: boolean;
  dragDisabled: boolean;
  onSelectToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id, disabled: dragDisabled });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2.5 rounded-lg px-1 py-2.5 transition-colors duration-200 hover:bg-sage-tint/40 ${selected ? 'bg-sage-tint/60' : ''} ${isDragging ? 'relative bg-surface shadow-soft ring-1 ring-green-strong' : ''}`}
    >
      <RecipeTileBody
        r={r}
        selectMode={selectMode}
        selected={selected}
        onSelectToggle={onSelectToggle}
        onDelete={onDelete}
        handle={
          !selectMode ? (
            <button
              type="button"
              aria-label="Glisser pour déplacer / réordonner"
              title="Glisser pour déplacer (appui long sur mobile)"
              {...attributes}
              {...listeners}
              className="cursor-grab touch-none text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
            >
              {HandleIcon}
            </button>
          ) : undefined
        }
      />
    </li>
  );
}

/** Zone de dépôt en bas de chaque groupe → permet de déposer dans un groupe (même vide). */
function GroupDropZone({ k, empty }: { k: string; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `grp-drop:${k}` });
  return (
    <div
      ref={setNodeRef}
      className={`mt-1 rounded-lg border border-dashed px-3 text-center text-xs transition-colors ${isOver ? 'border-green-strong bg-sage-tint/50 text-sage-deep' : 'border-line text-ink-soft/70'} ${empty ? 'py-4' : 'py-1.5'}`}
    >
      {empty ? 'Aucune recette — déposer ici' : 'Déposer ici'}
    </div>
  );
}

function GroupHeaderActions({ id, name, onRefresh }: { id: string; name: string; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const [, start] = useTransition();

  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        action={() => start(async () => { await renameGroupAction(id, value); setEditing(false); onRefresh(); })}
      >
        <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus className="field-input w-36 px-2 py-1 text-sm" aria-label="Nom du groupe" />
        <button type="submit" className="rounded-full bg-green-strong px-2 py-1 text-[11px] font-semibold text-white">✓</button>
        <button type="button" onClick={() => { setValue(name); setEditing(false); }} aria-label="Annuler" className="rounded-full bg-line/60 px-2 py-1 text-[11px] text-ink-soft">✕</button>
      </form>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-1">
      <button type="button" onClick={() => setEditing(true)} aria-label="Renommer le groupe" title="Renommer" className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-sage-tint/50 hover:text-sage-deep">{PencilIcon}</button>
      {confirming ? (
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => start(async () => { await deleteGroupAction(id); onRefresh(); })} className="rounded-full bg-clay px-2 py-1 text-[11px] font-semibold text-white">Supprimer</button>
          <button type="button" onClick={() => setConfirming(false)} aria-label="Annuler" className="rounded-full bg-line/60 px-2 py-1 text-[11px] text-ink-soft">✕</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} aria-label="Supprimer le groupe" title="Supprimer le groupe (les recettes retombent « Sans groupe »)" className="flex h-7 w-7 items-center justify-center rounded-full bg-clay-tint/60 text-[#c2774f] hover:bg-clay-tint">{<TrashIcon size={14} />}</button>
      )}
    </span>
  );
}

function GroupSection({
  g,
  selectMode,
  selected,
  collapsed,
  dragDisabled,
  onToggleCollapse,
  onToggleSelect,
  onDeleteRecipe,
  onRefresh,
}: {
  g: RecipeGroupSection;
  selectMode: boolean;
  selected: Set<string>;
  collapsed: boolean;
  dragDisabled: boolean;
  onToggleCollapse: () => void;
  onToggleSelect: (id: string) => void;
  onDeleteRecipe: (id: string) => void;
  onRefresh: () => void;
}) {
  const k = sectionKey(g.view.id);
  const isUngrouped = g.view.id === null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `grp:${k}`, disabled: dragDisabled || isUngrouped });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined };
  const itemIds = useMemo(() => g.recipes.map((r) => r.id), [g.recipes]);

  return (
    <section ref={setNodeRef} style={style} className={`relative rounded-2xl border bg-surface p-3.5 shadow-soft ${isDragging ? 'border-green-strong ring-1 ring-green-strong' : 'border-line'}`}>
      <div className="mb-1 flex items-center gap-2">
        {!isUngrouped && !dragDisabled && (
          <button type="button" aria-label="Glisser pour réordonner les groupes" title="Glisser pour réordonner les groupes" {...attributes} {...listeners} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft/60 hover:bg-sage-tint/50 hover:text-ink-soft cursor-grab touch-none active:cursor-grabbing">{HandleIcon}</button>
        )}
        <button type="button" onClick={onToggleCollapse} aria-label={collapsed ? 'Déplier' : 'Replier'} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-sage-tint/50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <h2 className="font-display text-base font-semibold">{g.view.name}</h2>
        <span className="text-xs text-ink-soft">{g.recipes.length}</span>
        {!isUngrouped && !selectMode && <GroupHeaderActions id={g.view.id!} name={g.view.name} onRefresh={onRefresh} />}
      </div>
      {!collapsed && (
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-line">
            {g.recipes.map((r) => (
              <SortableRecipeTile
                key={r.id}
                r={r}
                selectMode={selectMode}
                selected={selected.has(r.id)}
                dragDisabled={dragDisabled}
                onSelectToggle={() => onToggleSelect(r.id)}
                onDelete={() => onDeleteRecipe(r.id)}
              />
            ))}
          </ul>
          {/* Zone de dépôt visible UNIQUEMENT pour un groupe vide (sinon on lâche sur les
              recettes existantes). Évite l'encombrement sous les groupes remplis. */}
          {!dragDisabled && g.recipes.length === 0 && <GroupDropZone k={k} empty />}
        </SortableContext>
      )}
    </section>
  );
}

export function RecipesView({ sections: serverSections }: { sections: RecipeGroupSection[] }) {
  const router = useRouter();
  const sensors = useDndSensors();
  const [, startMove] = useTransition();
  const [bulkPending, startBulk] = useTransition();
  const refresh = () => router.refresh();

  const [board, setBoard] = useState<RecipeGroupSection[]>(serverSections);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [syncedServer, setSyncedServer] = useState(serverSections);
  if (!activeId && serverSections !== syncedServer) {
    setSyncedServer(serverSections);
    setBoard(serverSections);
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const dragFrom = useRef<string | null>(null);

  const allTiles = useMemo(() => board.flatMap((g) => g.recipes), [board]);
  const dragDisabled = selectMode;
  const realGroups = useMemo(() => board.filter((g) => g.view.id !== null), [board]);
  const groupSortableIds = useMemo(() => realGroups.map((g) => `grp:${sectionKey(g.view.id)}`), [realGroups]);
  const allSelected = allTiles.length > 0 && allTiles.every((r) => selected.has(r.id));

  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleCollapse(key: string) {
    setCollapsed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  function groupKeyOf(id: string): string | null {
    const g = board.find((b) => b.recipes.some((r) => r.id === id));
    return g ? sectionKey(g.view.id) : null;
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    dragFrom.current = id.startsWith('grp:') ? null : groupKeyOf(id);
  }

  // Glisser une tuile au-dessus d'une autre section : on l'y déplace EN DIRECT.
  function onDragOver(e: DragOverEvent) {
    const aId = String(e.active.id);
    if (aId.startsWith('grp:')) return;
    const oRaw = e.over ? String(e.over.id) : null;
    if (!oRaw) return;
    const targetKey = oRaw.startsWith('grp-drop:') ? oRaw.slice(9) : groupKeyOf(oRaw);
    if (targetKey == null) return;
    setBoard((prev) => {
      const fromKey = prev.find((g) => g.recipes.some((r) => r.id === aId))?.view;
      const fromK = fromKey ? sectionKey(fromKey.id) : null;
      if (fromK == null || fromK === targetKey) return prev;
      const tile = prev.find((g) => sectionKey(g.view.id) === fromK)!.recipes.find((r) => r.id === aId)!;
      return prev.map((g) => {
        const key = sectionKey(g.view.id);
        if (key === fromK) return { ...g, recipes: g.recipes.filter((r) => r.id !== aId) };
        if (key === targetKey) {
          const recipes = g.recipes.filter((r) => r.id !== aId);
          const idx = oRaw.startsWith('grp-drop:') ? recipes.length : recipes.findIndex((r) => r.id === oRaw);
          recipes.splice(idx < 0 ? recipes.length : idx, 0, tile);
          return { ...g, recipes };
        }
        return g;
      });
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const aId = String(e.active.id);
    setActiveId(null);
    const oRaw = e.over ? String(e.over.id) : null;
    const cur = board;

    if (aId.startsWith('grp:')) {
      if (!oRaw || !oRaw.startsWith('grp:') || aId === oRaw) return;
      const keys = realGroups.map((g) => sectionKey(g.view.id));
      const from = keys.indexOf(aId.slice(4));
      const to = keys.indexOf(oRaw.slice(4));
      if (from < 0 || to < 0 || from === to) return;
      const newKeys = arrayMove(keys, from, to);
      const byKey = new Map(cur.map((g) => [sectionKey(g.view.id), g]));
      const ungrouped = cur.find((g) => g.view.id === null);
      setBoard([...newKeys.map((k) => byKey.get(k)!), ...(ungrouped ? [ungrouped] : [])]);
      startMove(async () => { await reorderGroupsAction(newKeys); refresh(); });
      return;
    }

    const grp = cur.find((g) => g.recipes.some((r) => r.id === aId));
    if (!grp) return;
    let recipes = grp.recipes;
    if (oRaw && !oRaw.startsWith('grp') && oRaw !== aId && recipes.some((r) => r.id === oRaw)) {
      const ids = recipes.map((r) => r.id);
      const from = ids.indexOf(aId);
      const to = ids.indexOf(oRaw);
      if (from >= 0 && to >= 0 && from !== to) {
        recipes = arrayMove(recipes, from, to);
        setBoard(cur.map((g) => (sectionKey(g.view.id) === sectionKey(grp.view.id) ? { ...g, recipes } : g)));
      }
    }
    const key = sectionKey(grp.view.id);
    const orderedIds = recipes.map((r) => r.id);
    dragFrom.current = null;
    startMove(async () => { await reorderRecipesAction(key === '' ? null : key, orderedIds); refresh(); });
  }

  function bulkMove(groupId: string | null) {
    const ids = [...selected];
    setMoveOpen(false);
    startBulk(async () => { await bulkMoveRecipesAction(ids, groupId); exitSelect(); refresh(); });
  }
  function bulkDelete() {
    const ids = [...selected];
    startBulk(async () => { await bulkDeleteRecipesAction(ids); exitSelect(); refresh(); });
  }
  function deleteRecipe(id: string) {
    startMove(async () => { await removeRecipeAction(id); refresh(); });
  }
  function sortRecipes(by: RecipeSortBy, ids?: string[]) {
    startBulk(async () => {
      await sortRecipesAction(by, ids);
      if (ids) exitSelect();
      refresh();
    });
  }
  function sortGroups(by: GroupSortBy) {
    startBulk(async () => {
      await sortGroupsAction(by);
      refresh();
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form action={() => { const n = newGroup.trim(); if (n) startMove(async () => { await createGroupAction(n); setNewGroup(''); refresh(); }); }} className="flex items-center gap-1.5">
          <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Nouveau groupe…" aria-label="Nom du nouveau groupe" className="field-input w-44 px-3 py-1.5 text-sm" />
          <button type="submit" disabled={!newGroup.trim()} className="btn-secondary py-1.5 text-sm disabled:opacity-50">+ Groupe</button>
        </form>
        {selectMode ? (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setSelected(allSelected ? new Set() : new Set(allTiles.map((r) => r.id)))} className="text-xs font-semibold text-green-strong">{allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
            <button type="button" onClick={exitSelect} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft">Terminé</button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <SortMenu
              triggerClass="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft hover:border-green-strong hover:text-green-strong"
              includeGroups
              onSortRecipes={(by) => sortRecipes(by)}
              onSortGroups={(by) => sortGroups(by)}
            />
            <button type="button" onClick={() => setSelectMode(true)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft hover:border-green-strong hover:text-green-strong">Sélectionner</button>
          </div>
        )}
      </div>

      <DndContext id="recipes-dnd" sensors={sensors} collisionDetection={collisionStrategy} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <SortableContext items={groupSortableIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {board.map((g) => (
              <GroupSection
                key={sectionKey(g.view.id) || 'ungrouped'}
                g={g}
                selectMode={selectMode}
                selected={selected}
                collapsed={collapsed.has(sectionKey(g.view.id))}
                dragDisabled={dragDisabled}
                onToggleCollapse={() => toggleCollapse(sectionKey(g.view.id))}
                onToggleSelect={toggleSelect}
                onDeleteRecipe={deleteRecipe}
                onRefresh={refresh}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-paper shadow-soft ring-1 ring-black/10" style={{ background: 'var(--color-ink)' }}>
            <span className="px-1 font-semibold">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
            <button type="button" onClick={() => setMoveOpen(true)} disabled={bulkPending} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-60">Déplacer vers…</button>
            <SortMenu
              triggerClass="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-paper ring-1 ring-white/20 hover:bg-white/20"
              dropUp
              onSortRecipes={(by) => sortRecipes(by, [...selected])}
            />
            <button type="button" onClick={bulkDelete} disabled={bulkPending} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-clay-tint ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-60">Supprimer</button>
          </div>
        </div>
      )}

      {moveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(40,38,34,0.32)' }} onClick={() => setMoveOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">Déplacer {selected.size} recette{selected.size > 1 ? 's' : ''}</h3>
            <p className="mt-0.5 text-sm text-ink-soft">Choisis le groupe de destination.</p>
            <div className="mt-3 flex max-h-72 flex-col gap-1 overflow-auto">
              {realGroups.map((g) => (
                <button key={g.view.id!} type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-sage-tint/50" onClick={() => bulkMove(g.view.id)}>{g.view.name}</button>
              ))}
              <button type="button" className="rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-sage-tint/50" onClick={() => bulkMove(null)}>Sans groupe</button>
            </div>
            <button type="button" onClick={() => setMoveOpen(false)} className="mt-3 w-full py-2 text-sm text-ink-soft">Annuler</button>
          </div>
        </div>
      )}
    </>
  );
}
