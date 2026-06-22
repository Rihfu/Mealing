import type { QueuedOp } from '@/lib/offline/queue';
import { toggleCheckAction, checkoutToStockAction } from './actions';

/**
 * Rejoue une opération mise en file hors-ligne, au retour du réseau. Partagé entre le
 * mode magasin (`store-list`) et le gestionnaire de synchro global (`SyncManager`) pour
 * un comportement unique. Les coches (`toggle`) sont des set d'état idempotents ; le
 * `checkout` range les articles cochés au stock — il est toujours rejoué APRÈS les
 * coches (ordre FIFO de la file), donc l'état serveur est correct.
 */
export async function replayOp(op: QueuedOp): Promise<void> {
  if (op.kind === 'toggle') {
    const fd = new FormData();
    fd.set('item_key', op.key);
    fd.set('checked', String(op.checked));
    await toggleCheckAction(fd);
  } else {
    await checkoutToStockAction(
      Object.keys(op.prices).length > 0 ? op.prices : undefined,
      op.extras && op.extras.length > 0 ? op.extras : undefined,
    );
  }
}
