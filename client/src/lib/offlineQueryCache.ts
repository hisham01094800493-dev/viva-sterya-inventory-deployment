import type { QueryClient, QueryKey } from "@tanstack/react-query";

const DB_NAME = "smart-inventory-query-cache";
const STORE_NAME = "snapshots";
const DB_VERSION = 1;
export const OFFLINE_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const OFFLINE_CACHE_MAX_SNAPSHOTS = 100;
const CACHEABLE_PROCEDURES = new Set([
  "items.list",
  "items.listPaged",
  "items.categories",
  "items.card",
  "items.mainWarehouseCards",
  "additions.list",
  "additions.account",
  "disbursements.list",
  "disbursements.account",
  "transfers.list",
  "dashboard.summary",
  "customers.list",
  "suppliers.list",
  "warehouses.list",
  "settings.list",
]);

type Snapshot = {
  key: string;
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
};

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function keyFor(queryKey: QueryKey) {
  return JSON.stringify(queryKey);
}

export function isOfflineCacheableQuery(queryKey: QueryKey) {
  const first = queryKey[0];
  const [namespace, procedure] = Array.isArray(first) ? first : queryKey;
  return typeof namespace === "string" && typeof procedure === "string" && CACHEABLE_PROCEDURES.has(`${namespace}.${procedure}`);
}

function readAll(db: IDBDatabase): Promise<Snapshot[]> {
  return new Promise(resolve => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result ?? []) as Snapshot[]);
    request.onerror = () => resolve([]);
  });
}

function putSnapshot(db: IDBDatabase, snapshot: Snapshot) {
  return new Promise<void>(resolve => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(snapshot);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

export function getSnapshotKeysForCleanup(
  snapshots: Snapshot[],
  now = Date.now(),
  maxAgeMs = OFFLINE_CACHE_MAX_AGE_MS,
  maxSnapshots = OFFLINE_CACHE_MAX_SNAPSHOTS,
) {
  const cutoff = now - maxAgeMs;
  const ordered = [...snapshots].sort((left, right) => right.updatedAt - left.updatedAt);
  const keep = ordered.filter(snapshot => snapshot.updatedAt >= cutoff).slice(0, maxSnapshots);
  const keepKeys = new Set(keep.map(snapshot => snapshot.key));
  return snapshots.filter(snapshot => !keepKeys.has(snapshot.key)).map(snapshot => snapshot.key);
}

async function cleanupOfflineQueryCache(now = Date.now()) {
  const db = await openDatabase();
  if (!db) return 0;
  const snapshots = await readAll(db);
  const keysToDelete = getSnapshotKeysForCleanup(snapshots, now);
  if (keysToDelete.length === 0) {
    db.close();
    return 0;
  }
  await new Promise<void>(resolve => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const key of keysToDelete) store.delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
  db.close();
  return keysToDelete.length;
}

export async function restoreOfflineQueryCache(queryClient: QueryClient) {
  const db = await openDatabase();
  if (!db) return 0;
  db.close();
  await cleanupOfflineQueryCache();
  const refreshedDb = await openDatabase();
  if (!refreshedDb) return 0;
  const snapshots = await readAll(refreshedDb);
  let restored = 0;
  for (const snapshot of snapshots) {
    try {
      queryClient.setQueryData(snapshot.queryKey, snapshot.data, { updatedAt: snapshot.updatedAt });
      restored += 1;
    } catch {
      // Ignore an invalid or obsolete snapshot and keep the rest available.
    }
  }
  refreshedDb.close();
  return restored;
}

export async function persistOfflineQuery(queryKey: QueryKey, data: unknown, updatedAt: number) {
  if (!isOfflineCacheableQuery(queryKey) || data === undefined) return;
  try {
    const serializable = JSON.parse(JSON.stringify(data));
    const db = await openDatabase();
    if (!db) return;
    await putSnapshot(db, { key: keyFor(queryKey), queryKey, data: serializable, updatedAt });
    db.close();
    await cleanupOfflineQueryCache(updatedAt);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("smart-inventory:offline-cache-updated", { detail: { updatedAt } }));
    }
  } catch {
    // Local persistence is best-effort and must never block the live query.
  }
}

export async function getLatestOfflineSnapshotTime() {
  const db = await openDatabase();
  if (!db) return null;
  const snapshots = await readAll(db);
  db.close();
  return snapshots.reduce<number | null>((latest, snapshot) => latest === null || snapshot.updatedAt > latest ? snapshot.updatedAt : latest, null);
}

export function subscribeToOfflineQueryCache(queryClient: QueryClient) {
  return queryClient.getQueryCache().subscribe(event => {
    if (event.type !== "updated") return;
    const query = event.query;
    if (query.state.status !== "success" || !query.state.dataUpdatedAt) return;
    void persistOfflineQuery(query.queryKey, query.state.data, query.state.dataUpdatedAt);
  });
}
