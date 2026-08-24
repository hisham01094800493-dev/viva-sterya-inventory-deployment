export type NotificationPriority = "low" | "normal" | "high" | "critical";

export type NotificationSummary = {
  id: number;
  title: string;
  message?: string | null;
  notificationType?: string | null;
  priority?: NotificationPriority | string | null;
  isRead: boolean;
};

export type NotificationTone = { frequency: number; duration: number };

export const NOTIFICATION_SEEN_KEY = "smart-inventory-notification-seen";
export const MAX_SEEN_NOTIFICATION_IDS = 100;

export function getSeenNotificationIds(storage: Storage | undefined): Set<number> {
  if (!storage) return new Set();
  try {
    const parsed = JSON.parse(storage.getItem(NOTIFICATION_SEEN_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter(value => Number.isInteger(value)) : []);
  } catch {
    return new Set();
  }
}

export function rememberUnreadNotificationIds(storage: Storage | undefined, rows: NotificationSummary[]) {
  if (!storage) return;
  try {
    storage.setItem(
      NOTIFICATION_SEEN_KEY,
      JSON.stringify(rows.filter(row => !row.isRead).map(row => row.id).slice(0, MAX_SEEN_NOTIFICATION_IDS)),
    );
  } catch {
    // Notification history is an enhancement; storage failure must not affect the app.
  }
}

export function findNewUnreadNotification(rows: NotificationSummary[], seenIds: Set<number>) {
  return rows.find(row => !row.isRead && !seenIds.has(row.id)) ?? null;
}

export function formatIncomingNotification(row: NotificationSummary) {
  if (row.notificationType === "help_request") {
    return `طلب مساعدة جديد: ${row.title.replace(/^طلب مساعدة:\s*/, "")}`;
  }
  return row.title;
}

export function getNotificationTone(priority?: string | null): NotificationTone {
  if (priority === "critical") return { frequency: 880, duration: 0.28 };
  if (priority === "high") return { frequency: 780, duration: 0.24 };
  return { frequency: 680, duration: 0.2 };
}
