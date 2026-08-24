import { describe, expect, it } from "vitest";
import { selectHelpRequestOwner } from "./db";

type Notification = { recipientUserId: number | null; isRead: boolean; readAt?: string | null; priority: "low" | "normal" | "high" | "critical" };

function isVisibleToUser(notification: Notification, userId: number) {
  return notification.recipientUserId === null || notification.recipientUserId === 0 || notification.recipientUserId === userId;
}

function unreadCount(notifications: Notification[]) {
  return notifications.filter(notification => !notification.isRead).length;
}

function recipientIdsForNotification(selectedIds: number[]) {
  return selectedIds.length ? selectedIds : [0];
}

function markAsRead(notification: Notification, readAt: string) {
  return { ...notification, isRead: true, readAt };
}

function clearReadRows(rows: Notification[], userId: number) {
  return rows.filter(row => !(row.isRead && (row.recipientUserId === 0 || row.recipientUserId === userId)));
}

function helpRequestRecipientIds(ownerId: number) {
  return [ownerId];
}

function isValidHelpStatus(value: string): value is "new" | "in_progress" | "completed" {
  return value === "new" || value === "in_progress" || value === "completed";
}

describe("custom notification policy", () => {
  it("shows broadcast notifications and direct notifications only to their recipient", () => {
    const rows: Notification[] = [
      { recipientUserId: null, isRead: false, priority: "normal" },
      { recipientUserId: 0, isRead: false, priority: "high" },
      { recipientUserId: 7, isRead: false, priority: "critical" },
      { recipientUserId: 9, isRead: false, priority: "low" },
    ];
    expect(rows.filter(row => isVisibleToUser(row, 7))).toHaveLength(3);
    expect(rows.filter(row => isVisibleToUser(row, 9))).toHaveLength(3);
  });

  it("counts only unread rows for the bell badge", () => {
    expect(unreadCount([
      { recipientUserId: null, isRead: false, priority: "normal" },
      { recipientUserId: null, isRead: true, priority: "low" },
      { recipientUserId: 7, isRead: false, priority: "high" },
    ])).toBe(2);
  });

  it("accepts the four supported priority levels", () => {
    expect(["low", "normal", "high", "critical"] satisfies Notification["priority"][]).toHaveLength(4);
  });

  it("uses broadcast recipient zero when no users are selected and preserves selected ids otherwise", () => {
    expect(recipientIdsForNotification([])).toEqual([0]);
    expect(recipientIdsForNotification([7, 9])).toEqual([7, 9]);
  });

  it("records the opening time when a recipient opens an unread notification", () => {
    expect(markAsRead({ recipientUserId: 7, isRead: false, readAt: null, priority: "normal" }, "2026-08-19T08:30:00.000Z")).toMatchObject({ isRead: true, readAt: "2026-08-19T08:30:00.000Z" });
  });

  it("clears only read notifications for the current admin and broadcasts", () => {
    const rows: Notification[] = [
      { recipientUserId: 7, isRead: true, priority: "normal" },
      { recipientUserId: 0, isRead: true, priority: "low" },
      { recipientUserId: 7, isRead: false, priority: "high" },
      { recipientUserId: 9, isRead: true, priority: "critical" },
    ];
    expect(clearReadRows(rows, 7)).toEqual([
      { recipientUserId: 7, isRead: false, priority: "high" },
      { recipientUserId: 9, isRead: true, priority: "critical" },
    ]);
  });

  it("routes help requests to the owner only", () => {
    expect(helpRequestRecipientIds(1)).toEqual([1]);
  });

  it("falls back to the first administrator when the configured owner is missing", () => {
    expect(selectHelpRequestOwner(undefined, [{ id: 1 }, { id: 8 }])).toEqual({ id: 1 });
    expect(selectHelpRequestOwner({ id: 8 }, [{ id: 1 }])).toEqual({ id: 8 });
  });

  it("supports only the three help request statuses", () => {
    expect(["new", "in_progress", "completed"].every(isValidHelpStatus)).toBe(true);
    expect(isValidHelpStatus("cancelled")).toBe(false);
  });
});

export { isVisibleToUser, unreadCount, recipientIdsForNotification, markAsRead, clearReadRows, helpRequestRecipientIds, isValidHelpStatus };
