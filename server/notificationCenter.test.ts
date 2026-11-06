import { describe, expect, it } from "vitest";
import {
  findNewUnreadNotification,
  formatIncomingNotification,
  getNotificationTone,
  getSeenNotificationIds,
  rememberUnreadNotificationIds,
} from "../client/src/lib/notificationCenter";
import { buildDailyReportNotificationLink, resolveNotificationLink } from "../shared/dailyReportRoute";

type Row = { id: number; title: string; message?: string; notificationType?: string; priority?: string; isRead: boolean };

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as unknown as Storage;
}

describe("notification center", () => {
  it("routes old daily-report notices to project disbursements for the matching project", () => {
    const link = resolveNotificationLink({
      notificationType: "daily_report",
      title: "التقرير التنفيذي اليومي — مشروع B1",
      message: "[مشروع B1] التقرير التنفيذي 2026-11-05",
      link: "/settings",
      createdAt: new Date("2026-11-05T15:00:00.000Z"),
    }, [{ id: 7, name: "مشروع B1" }]);
    expect(link).toBe(buildDailyReportNotificationLink("2026-11-05", 7));
    expect(link.startsWith("/project-work-center?")).toBe(true);
    const params = new URLSearchParams(link.split("?")[1]);
    expect(params.get("date")).toBe("2026-11-05");
    expect(params.get("projectId")).toBe("7");
  });

  it("preserves project IDs and dates from old report links and new work-center links", () => {
    expect(resolveNotificationLink({
      notificationType: "daily_report",
      link: "/reports?from=2026-11-05&to=2026-11-05&movement=%D8%B5%D8%B1%D9%81&projectId=4",
    })).toBe(buildDailyReportNotificationLink("2026-11-05", 4));
    expect(resolveNotificationLink({
      notificationType: "daily_report",
      link: "/project-work-center?date=2026-11-04&projectId=6",
    })).toBe(buildDailyReportNotificationLink("2026-11-04", 6));
    expect(resolveNotificationLink({ notificationType: "daily_report", link: "/settings", createdAt: "2026-11-05T22:30:00.000Z" }))
      .toBe(buildDailyReportNotificationLink("2026-11-06"));
    expect(resolveNotificationLink({ notificationType: "help_request", link: "/chat" })).toBe("/chat");
    expect(resolveNotificationLink({ notificationType: "help_request" })).toBe("/alerts");
  });

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
