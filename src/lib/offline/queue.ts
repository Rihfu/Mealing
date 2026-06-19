import { idbGet, idbSet } from './idb';

/**
 * File d'attente (IndexedDB) des mutations faites HORS-LIGNE, rejouées au retour du
 * réseau : coches du mode magasin ET passage en caisse (« J'ai fait mes courses »).
 * Ordre préservé (FIFO) → les coches sont rejouées AVANT le checkout, donc l'état
 * serveur est correct au moment de ranger les achats au stock.
 */
export type QueuedOp =
  | { kind: 'toggle'; key: string; checked: boolean }
  | { kind: 'checkout'; prices: Record<string, number> };

const KEY = 'sync:magasin-queue';

/** Événement diffusé quand la file change (enqueue / vidage) → indicateurs de synchro. */
export const QUEUE_EVENT = 'mealing:queue';
function notifyChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_EVENT));
}

export async function getQueue(): Promise<QueuedOp[]> {
  return (await idbGet<QueuedOp[]>(KEY)) ?? [];
}

/** Empile une opération en dédoublonnant : une coche écrase la précédente sur la même
 *  clé (seul l'état final compte) ; un checkout écrase tout checkout antérieur (un seul
 *  passage en caisse en attente). L'ordre d'apparition est par ailleurs préservé. */
export async function enqueueOp(op: QueuedOp): Promise<number> {
  let q = await getQueue();
  if (op.kind === 'toggle') q = q.filter((o) => !(o.kind === 'toggle' && o.key === op.key));
  else if (op.kind === 'checkout') q = q.filter((o) => o.kind !== 'checkout');
  q.push(op);
  await idbSet(KEY, q);
  notifyChange();
  return q.length;
}

export async function clearQueue(): Promise<void> {
  await idbSet(KEY, []);
  notifyChange();
}

// Garde anti-concurrence : une seule synchro à la fois (le mode magasin ET le
// gestionnaire global peuvent tous deux déclencher un flush au retour réseau).
let flushing: Promise<boolean> | null = null;

/**
 * Rejoue la file dans l'ordre via `replay`. S'arrête à la 1ʳᵉ erreur (toujours
 * hors-ligne) en conservant la file ; sinon vide la file. Renvoie `true` si au moins
 * une opération a été synchronisée (→ utile pour un toast « N synchronisé(s) »).
 */
export async function flushQueue(replay: (op: QueuedOp) => Promise<void>): Promise<boolean> {
  if (flushing) return flushing;
  flushing = (async () => {
    const q = await getQueue();
    if (q.length === 0) return false;
    for (const op of q) {
      try {
        await replay(op);
      } catch {
        return false; // encore hors-ligne : on retentera au prochain événement « online »
      }
    }
    await clearQueue();
    return true;
  })();
  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}
