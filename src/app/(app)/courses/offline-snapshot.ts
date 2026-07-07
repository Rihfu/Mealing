import { idbGet, idbSet } from '@/lib/offline/idb';
import { categoryLabel } from '@/lib/product-assets';
import { catView, OTHER_KEY } from './rayons';
import type { CoursesSnapshot } from './snapshot';
import type { SGroup, SLine } from './shopping-list';

/** Clé IndexedDB de l'instantané de la liste (celle de `useCachedResource` dans CoursesView). */
export const COURSES_SNAPSHOT_KEY = 'courses:snapshot';

/**
 * Patch HORS-LIGNE de l'instantané caché de la liste : déplace une ligne entre
 * « À acheter » et « Déjà pris » sans réseau, pour que la revalidation (qui,
 * hors-ligne, relit le cache) reflète la coche mise en file — et qu'elle SURVIVE
 * à un rechargement sans connexion. Le placement fin (ordre des lignes, prix
 * suggéré au checkout) est réconcilié à la prochaine revalidation réseau.
 */
export async function applyToggleToCachedSnapshot(lineKey: string, checked: boolean): Promise<void> {
  const snap = await idbGet<CoursesSnapshot | null>(COURSES_SNAPSHOT_KEY);
  if (!snap) return;

  if (checked) {
    // À acheter → Déjà pris.
    let moved: SLine | null = null;
    const activeGroups: SGroup[] = [];
    for (const g of snap.activeGroups) {
      const hit = g.items.find((l) => l.key === lineKey);
      if (!hit) {
        activeGroups.push(g);
        continue;
      }
      moved = { ...hit, checked: true };
      const items = g.items.filter((l) => l.key !== lineKey);
      if (items.length > 0) activeGroups.push({ ...g, items });
    }
    if (!moved) return; // déjà cochée / inconnue : rien à patcher
    const doneLines = [...snap.doneLines.filter((l) => l.key !== lineKey), moved];
    const checkoutItems = snap.checkoutItems.some((c) => c.key === lineKey)
      ? snap.checkoutItems
      : [
          ...snap.checkoutItems,
          { key: moved.key, name: moved.name, qty: moved.qty, category: categoryLabel(moved.category), suggestedPrice: null },
        ];
    await idbSet(COURSES_SNAPSHOT_KEY, {
      ...snap,
      activeGroups,
      doneLines,
      checkoutItems,
      activeCount: Math.max(0, snap.activeCount - 1),
      doneCount: snap.doneCount + 1,
    } satisfies CoursesSnapshot);
    return;
  }

  // Déjà pris → À acheter.
  const hit = snap.doneLines.find((l) => l.key === lineKey);
  if (!hit) return;
  const moved: SLine = { ...hit, checked: false };
  const doneLines = snap.doneLines.filter((l) => l.key !== lineKey);
  const checkoutItems = snap.checkoutItems.filter((c) => c.key !== lineKey);
  const gk = catView(moved.category, snap.customCats) ? (moved.category as string) : OTHER_KEY;
  let placed = false;
  let activeGroups = snap.activeGroups.map((g) => {
    if (g.key !== gk) return g;
    placed = true;
    return { ...g, items: [...g.items, moved] };
  });
  if (!placed) {
    // Le rayon avait disparu (il était vide) : on le recrée avec sa vue d'affichage.
    const view = catView(gk, snap.customCats);
    const created: SGroup = {
      key: gk,
      label: view?.label ?? 'Autres',
      tint: view?.tint ?? 'var(--color-line)',
      ink: view?.ink ?? 'var(--color-ink-soft)',
      iconSlug: view?.isCustom ? (view.iconSlug ?? null) : null,
      items: [moved],
    };
    // « Autres » reste en dernier ; sinon on insère juste avant lui (l'ordre exact
    // du foyer est rétabli à la revalidation réseau).
    const idxOther = activeGroups.findIndex((g) => g.key === OTHER_KEY);
    activeGroups =
      gk === OTHER_KEY || idxOther < 0
        ? [...activeGroups, created]
        : [...activeGroups.slice(0, idxOther), created, ...activeGroups.slice(idxOther)];
  }
  await idbSet(COURSES_SNAPSHOT_KEY, {
    ...snap,
    activeGroups,
    doneLines,
    checkoutItems,
    activeCount: snap.activeCount + 1,
    doneCount: Math.max(0, snap.doneCount - 1),
  } satisfies CoursesSnapshot);
}
