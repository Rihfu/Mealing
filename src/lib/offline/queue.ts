import { idbGet, idbSet } from './idb';

/**
 * File d'attente (IndexedDB) des mutations faites HORS-LIGNE, rejouées au retour du
 * réseau. Pour l'instant : les coches du mode magasin. Ordre préservé (FIFO) afin que
 * la synchro reflète la séquence réelle des actions de l'utilisateur.
 */
export type QueuedOp = { kind: 'toggle'; key: string; checked: boolean };

const KEY = 'sync:magasin-queue';

export async function getQueue(): Promise<QueuedOp[]> {
  return (await idbGet<QueuedOp[]>(KEY)) ?? [];
}

/** Empile une opération. Pour une coche, on écrase la précédente sur la même clé
 *  (seul l'état final compte) tout en gardant l'ordre d'apparition. */
export async function enqueueOp(op: QueuedOp): Promise<number> {
  const q = (await getQueue()).filter((o) => !(o.kind === 'toggle' && o.key === op.key));
  q.push(op);
  await idbSet(KEY, q);
  return q.length;
}

export async function clearQueue(): Promise<void> {
  await idbSet(KEY, []);
}
