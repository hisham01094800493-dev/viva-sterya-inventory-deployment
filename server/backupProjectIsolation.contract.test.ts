import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getBackupRestoreCoverage,
  normalizeBackupRow,
  validateBackupSnapshot,
} from "./db";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const dbSource = read("server/db.ts");

describe("تغطية النسخ الاحتياطي لعزل المشاريع (المرحلة 10)", () => {
  it("يعتبر جدول المشاريع والمباني وسجل الجدولة جداول قابلة للاستعادة", () => {
    const coverage = getBackupRestoreCoverage({
      schemaVersion: 1,
      tables: { projects: [], buildings: [], reportSchedulerRuns: [] },
    });
    expect(coverage.restoredTables).toEqual([
      "projects",
      "buildings",
      "reportSchedulerRuns",
    ]);
    expect(coverage.skippedBackupTables).toEqual([]);
  });

  it("يصدّر المشاريع والمباني وسجل الجدولة بنطاق المشروع عند تحديده", () => {
    expect(dbSource).toContain("const projectWhere = scoped ? eq(projects.id, projectId!) : undefined;");
    expect(dbSource).toContain("const buildingWhere = scoped ? eq(buildings.projectId, projectId!) : undefined;");
    expect(dbSource).toContain("eq(reportSchedulerRuns.projectId, projectId!)");
    expect(dbSource).toContain("db.select().from(projects).where(projectWhere)");
    expect(dbSource).toContain("db.select().from(buildings).where(buildingWhere)");
    expect(dbSource).toContain("db.select().from(reportSchedulerRuns).where(reportRunWhere)");
  });

  it("يستعيد المشاريع قبل الجداول التابعة لها للحفاظ على التكامل المرجعي", () => {
    const restoreBlock = dbSource.slice(
      dbSource.indexOf("await merge(\"projects\""),
      dbSource.indexOf("await merge(\"projects\"") + 1200
    );
    const projectsIndex = restoreBlock.indexOf("await merge(\"projects\"");
    const usersIndex = restoreBlock.indexOf("await merge(\"users\"");
    const warehousesIndex = restoreBlock.indexOf("await merge(\"warehouses\"");
    const buildingsIndex = restoreBlock.indexOf("await merge(\"buildings\"");
    expect(projectsIndex).toBeGreaterThan(-1);
    expect(projectsIndex).toBeLessThan(usersIndex);
    expect(usersIndex).toBeLessThan(warehousesIndex);
    expect(warehousesIndex).toBeLessThan(buildingsIndex);
  });

  it("يحتوي مخطط الاستعادة الكاملة على المشاريع والمباني وسجل الجدولة", () => {
    expect(dbSource).toContain("reportSchedulerRuns: \"report_scheduler_runs\"");
    expect(dbSource).toContain("projects: \"projects\"");
    expect(dbSource).toContain("buildings: \"buildings\"");
    const verificationBlock = dbSource.slice(
      dbSource.indexOf("const restoreTables: Record<string, any> = {"),
      dbSource.indexOf("const restoreTables: Record<string, any> = {") + 900
    );
    expect(verificationBlock).toContain("projects,");
    expect(verificationBlock).toContain("buildings,");
    expect(verificationBlock).toContain("reportSchedulerRuns,");
  });

  it("يحافظ على صلاحيات المشاريع الممنوحة عند التطبيع والاستعادة", () => {
    const normalized = normalizeBackupRow("userPermissions", {
      id: 7,
      userId: 12,
      allowedProjects: "[1,2,3]",
      allowedScreens: "[]",
      allowedReports: "[]",
      allowedWarehouses: "[]",
      readOnly: false,
      updatedAt: "2026-11-04T10:00:00.000Z",
    });
    expect(normalized.allowedProjects).toBe("[1,2,3]");
    expect(normalized.updatedAt).toBeInstanceOf(Date);
    // الاستعادة تحذف المعرّف فقط لجدول الصلاحيات، ولا تمس نطاق المشاريع.
    expect(dbSource).toContain(
      "Object.entries(normalizedRow).filter(([key]) => key !== \"id\")"
    );
  });

  it("يتحقق من طوابع وقت المشاريع والمباني وسجل الجدولة دون اعتبار التواريخ التجارية طوابع", () => {
    const validation = validateBackupSnapshot({
      schemaVersion: 1,
      tables: {
        projects: [{ createdAt: "2026-11-04T10:00:00.000Z", updatedAt: "2026-11-04T10:00:00.000Z" }],
        buildings: [{ createdAt: "2026-11-04T10:00:00.000Z", updatedAt: "2026-11-04T10:00:00.000Z" }],
        reportSchedulerRuns: [{ reportDate: "2026-11-04", startedAt: "2026-11-04T10:00:00.000Z", completedAt: null }],
      },
    });
    expect(validation.isValid).toBe(true);
    expect(validation.invalidTimestampFields).toEqual([]);
    expect(validation.rowCounts.projects).toBe(1);
    expect(validation.rowCounts.buildings).toBe(1);
    expect(validation.rowCounts.reportSchedulerRuns).toBe(1);
  });

  it("لا يحذف أي بيانات أثناء مسار الاستعادة", () => {
    const restoreBlock = dbSource.slice(
      dbSource.indexOf("async function restoreBackupSnapshotIntoDatabase("),
      dbSource.indexOf("export async function restoreBackupSnapshot(")
    );
    expect(restoreBlock.length).toBeGreaterThan(1000);
    expect(restoreBlock.toLowerCase()).not.toContain("delete from");
    expect(restoreBlock).not.toContain(".delete(");
  });
});
