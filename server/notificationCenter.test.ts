import { describe, expect, it } from "vitest";
import {
  findNewUnreadNotification,
  formatIncomingNotification,
  getNotificationTone,
  getSeenNotificationIds,
  rememberUnreadNotificationIds,
} from "../client/src/lib/notificationCenter";

type Row = { id: number; title: string; message?: string; notificationType?: string; priority?: string; isRead: boolean };

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as unknown as Storage;
}

describe("notification center", () => {
  it("finds only a new unread notification and ignores read or seen rows", () => {
    const rows: Row[] = [
      { id: 10, title: "مقروء", isRead: true },
      { id: 9, title: "قديم", isRead: false },
      { id: 8, title: "جديد", isRead: false },
    ];
    expect(findNewUnreadNotification(rows, new Set([9]))?.id).toBe(8);
    expect(findNewUnreadNotification(rows, new Set([8, 9]))).toBeNull();
  });

  it("remembers only the latest unread ids with safe storage parsing", () => {
    const storage = createStorage();
    rememberUnreadNotificationIds(storage, [
      { id: 1, title: "أ", isRead: false },
      { id: 2, title: "ب", isRead: true },
      { id: 3, title: "ج", isRead: false },
    ]);
    expect([...getSeenNotificationIds(storage)]).toEqual([1, 3]);
    storage.setItem("smart-inventory-notification-seen", "invalid-json");
    expect(getSeenNotificationIds(storage).size).toBe(0);
  });

  it("formats help requests and assigns a stronger tone to critical alerts", () => {
    expect(formatIncomingNotification({ id: 1, title: "طلب مساعدة: مشكلة في المزامنة", notificationType: "help_request", isRead: false })).toBe("طلب مساعدة جديد: مشكلة في المزامنة");
    expect(getNotificationTone("critical").frequency).toBeGreaterThan(getNotificationTone("normal").frequency);
  });
});
