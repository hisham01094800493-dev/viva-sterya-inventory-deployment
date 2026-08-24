import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";

type QueueModule = typeof import("../client/src/lib/offlineQueue");
let queue: QueueModule;

beforeAll(async () => {
  const listeners = new Map<string, Set<() => void>>();
  (globalThis as any).window = {
    indexedDB: (globalThis as any).indexedDB,
    addEventListener: (type: string, listener: () => void) => {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach(listener => listener());
      return true;
    },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  queue = await import("../client/src/lib/offlineQueue");
});

describe("offline movement queue", () => {
  it("stores a movement and removes it after a successful sync", async () => {
    const id = `offline-test-success-${Date.now()}`;
    await queue.enqueueOfflineMovement({ id, kind: "additions", payload: { clientRequestId: id, itemCode: "A-1", quantity: 2 } });
    expect((await queue.listOfflineQueue()).some(entry => entry.id === id)).toBe(true);
    const synced: string[] = [];
    await queue.syncOfflineQueue(async entry => { synced.push(entry.id); });
    expect(synced).toContain(id);
    expect((await queue.listOfflineQueue()).some(entry => entry.id === id)).toBe(false);
  });

  it("keeps a failed operation with an incremented attempt count", async () => {
    const id = `offline-test-failed-${Date.now()}`;
    await queue.enqueueOfflineMovement({ id, kind: "disbursements", payload: { clientRequestId: id, itemCode: "A-2", quantity: 1 } });
    await queue.syncOfflineQueue(async entry => {
      if (entry.id === id) throw new Error("network unavailable");
    });
    const entry = (await queue.listOfflineQueue()).find(item => item.id === id);
    expect(entry).toMatchObject({ id, status: "failed", attempts: 1, lastError: "network unavailable" });
    await queue.syncOfflineQueue(async () => undefined);
    expect((await queue.listOfflineQueue()).some(item => item.id === id)).toBe(false);
  });
});
