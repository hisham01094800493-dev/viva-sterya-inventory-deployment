export type OfflineMovementKind = "additions" | "disbursements" | "transfers";
export type OfflineQueueStatus = "pending" | "syncing" | "failed";

export type OfflineQueueEntry = {
  id: string;
  kind: OfflineMovementKind;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  status: OfflineQueueStatus;
  lastError?: string;
};

const DB_NAME = "smart-inventory-offline";
const STORE_NAME = "movement-queue";
const DB_VERSION = 1;
const QUEUE_EVENT = "smart-inventory-queue-changed";
const SYNC_EVENT = "smart-inventory-sync-request";

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) return reject(new Error("التخزين المحلي غير متاح في هذا المتصفح"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح طابور المزامنة"));
  });
}

function notifyQueueChanged() {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}

export function createOfflineRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function enqueueOfflineMovement(input: { kind: OfflineMovementKind; payload: Record<string, unknown>; id?: string }) {
  const entry: OfflineQueueEntry = {
    id: input.id ?? createOfflineRequestId(),
    kind: input.kind,
    payload: input.payload,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حفظ العملية محلياً"));
  });
  db.close();
  notifyQueueChanged();
  return entry;
}

export async function listOfflineQueue(): Promise<OfflineQueueEntry[]> {
  if (!canUseIndexedDb()) return [];
  const db = await openQueueDb();
  const entries = await new Promise<OfflineQueueEntry[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as OfflineQueueEntry[]).sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error ?? new Error("تعذر قراءة طابور المزامنة"));
  });
  db.close();
  return entries;
}

async function updateEntry(entry: OfflineQueueEntry) {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("تعذر تحديث طابور المزامنة"));
  });
  db.close();
  notifyQueueChanged();
}

async function removeEntry(id: string) {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حذف العملية المتزامنة"));
  });
  db.close();
  notifyQueueChanged();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر مزامنة العملية";
}

let syncInFlight = false;

export async function syncOfflineQueue(sync: (entry: OfflineQueueEntry) => Promise<unknown>) {
  if (syncInFlight || !canUseIndexedDb() || !navigator.onLine) return;
  syncInFlight = true;
  try {
    const entries = await listOfflineQueue();
    for (const entry of entries) {
      if (!navigator.onLine) break;
      await updateEntry({ ...entry, status: "syncing" });
      try {
        await sync(entry);
        await removeEntry(entry.id);
      } catch (error) {
        await updateEntry({ ...entry, status: "failed", attempts: entry.attempts + 1, lastError: errorMessage(error) });
      }
    }
  } finally {
    syncInFlight = false;
  }
}

export async function getOfflineQueueSummary() {
  const entries = await listOfflineQueue();
  return {
    total: entries.length,
    pending: entries.filter(entry => entry.status === "pending" || entry.status === "syncing").length,
    failed: entries.filter(entry => entry.status === "failed").length,
  };
}

export function requestOfflineSync() {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

export function subscribeOfflineQueue(onChange: () => void) {
  window.addEventListener(QUEUE_EVENT, onChange);
  return () => window.removeEventListener(QUEUE_EVENT, onChange);
}

export function subscribeOfflineSync(onSync: () => void) {
  window.addEventListener(SYNC_EVENT, onSync);
  return () => window.removeEventListener(SYNC_EVENT, onSync);
}
