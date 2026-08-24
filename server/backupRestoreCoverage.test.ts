import { describe, expect, it } from "vitest";
import { buildBackupVerificationFailureNotification, buildScheduledBackupFailureEmail, collectBackupAssetReferences, getBackupRestoreCoverage, getExpiredBackupRecordIds, getRestoreTestDatabaseName, normalizeBackupRow, validateBackupSnapshot } from "./db";

describe("backup restore coverage", () => {
  it("reports all backup tables handled by the operational restore path", () => {
    const coverage = getBackupRestoreCoverage({ schemaVersion: 1, tables: { items: [], additions: [], auditLogs: [] } });
    expect(coverage.restoredTables).toEqual(["items", "additions", "auditLogs"]);
    expect(coverage.skippedBackupTables).toEqual([]);
  });

  it("includes every live operational table and file reference required for a Railway migration", () => {
    const coverage = getBackupRestoreCoverage({ schemaVersion: 1, tables: { itemWarehouseBalances: [], notifications: [], chatConversations: [], chatMembers: [], chatMessages: [], chatMessageReceipts: [] } });
    expect(coverage.restoredTables).toEqual(["itemWarehouseBalances", "notifications", "chatConversations", "chatMembers", "chatMessages", "chatMessageReceipts"]);

    expect(collectBackupAssetReferences({
      items: [{ id: 1, imageKey: "items/1.webp", imageUrl: "/manus-storage/items/1.webp" }],
      additions: [{ id: 2, documentImageKey: "additions/2.webp" }],
      disbursements: [{ id: 3, documentImageUrl: "/manus-storage/disbursements/3.webp" }],
      transfers: [{ id: 4, documentImageKey: "transfers/4.webp" }],
      chatMessages: [{ id: 5, attachmentKey: "chat/5.pdf" }],
    })).toHaveLength(5);
  });

  it("converts only declared ISO timestamp fields into Date objects", () => {
    const normalized = normalizeBackupRow("additions", {
      createdAt: "2026-08-18T18:25:27.305Z",
      date: "2026-08-18",
      purpose: "مبنى L2",
    });

    expect(normalized.createdAt).toBeInstanceOf(Date);
    expect((normalized.createdAt as Date).toISOString()).toBe("2026-08-18T18:25:27.305Z");
    expect(normalized.date).toBe("2026-08-18");
    expect(normalized.purpose).toBe("مبنى L2");
  });

  it("validates every declared timestamp without confusing business dates with timestamps", () => {
    const validation = validateBackupSnapshot({
      schemaVersion: 1,
      tables: {
        additions: [{ createdAt: "2026-08-18T18:25:27.305Z", date: "2026-08-18" }],
        users: [{ createdAt: "not-a-timestamp", updatedAt: "2026-08-18T18:25:27.305Z", lastSignedIn: "2026-08-18T18:25:27.305Z" }],
      },
    });

    expect(validation.isValid).toBe(false);
    expect(validation.invalidTimestampFields).toEqual([{ table: "users", field: "createdAt", count: 1 }]);
    expect(validation.rowCounts.additions).toBe(1);
  });

  it("builds a critical admin notification pointing to the backup center on verification failure", () => {
    expect(buildBackupVerificationFailureNotification({ backupRecordId: 90001, message: "قيمة تاريخ غير صالحة" })).toEqual({
      notificationType: "backup_verification_failed",
      title: "فشل اختبار استعادة النسخة الاحتياطية",
      message: "فشل الاختبار الآمن للنسخة #90001. قيمة تاريخ غير صالحة",
      priority: "critical",
      link: "/governance?tab=backup-center",
    });
  });

  it("derives a dedicated and safe database name for full isolated restore", () => {
    expect(getRestoreTestDatabaseName("QMSWzgs2nvjUBG5BrRAQhD")).toBe("QMSWzgs2nvjUBG5BrRAQhD_restore_test");
    expect(() => getRestoreTestDatabaseName("production; DROP DATABASE")).toThrow("اسم قاعدة بيانات الإنتاج غير صالح");
  });

  it("expires only records beyond 30 days while always preserving the newest backup", () => {
    const now = new Date("2026-08-21T12:00:00.000Z");
    const records = [
      { id: 1, createdAt: new Date("2026-07-01T00:00:00.000Z") },
      { id: 2, createdAt: new Date("2026-07-20T00:00:00.000Z") },
      { id: 3, createdAt: new Date("2026-08-20T00:00:00.000Z") },
    ];
    expect(getExpiredBackupRecordIds(records, 30, now)).toEqual([1, 2]);
    expect(getExpiredBackupRecordIds([{ id: 1, createdAt: new Date("2026-01-01T00:00:00.000Z") }], 30, now)).toEqual([]);
  });

  it("builds the scheduled failure email with the backup number, time, and an escaped reason", () => {
    const email = buildScheduledBackupFailureEmail({ backupRecordId: 90001, failedAt: new Date("2026-08-21T02:00:00.000Z"), message: "فشل <اختبار>" });
    expect(email.subject).toContain("فشل اختبار الاستعادة الدوري");
    expect(email.html).toContain("#90001");
    expect(email.html).toContain("فشل &lt;اختبار&gt;");
    expect(email.html).toContain("وقت الفشل");
  });
});
