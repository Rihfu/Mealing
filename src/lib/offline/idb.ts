/**
 * Mini-cache clé→valeur sur IndexedDB (zéro dépendance) — socle du préchargement /
 * hors-ligne (Phase 2). Stocke des instantanés sérialisables (snapshots de la liste,
 * bundles de fiches produits…) pour un rendu instantané et une lecture sans réseau.
 * Tout est best-effort : si IndexedDB est indisponible (SSR, mode privé), on no-op.
 */
const DB_NAME = 'mealing';
const STORE = 'kv';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => resolve(undefined);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function idbDel(key: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
