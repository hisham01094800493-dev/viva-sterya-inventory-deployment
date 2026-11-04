import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDailyReportEmail } from "./reportEmailTemplate";
import { reportLockName, scheduleSettingKeys } from "./reportScheduler";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const schedulerSource = read("server/reportScheduler.ts");
const schemaSource = read("drizzle/schema.ts");
const scheduledSource = read("server/scheduled.ts");
const routerSource = read("server/routers.ts");
const templateSource = read("server/reportEmailTemplate.ts");
const migrationSource = read("drizzle/0038_report_scheduler_project_isolation.sql");
const settingsPageSource = read("client/src/pages/InventoryPages.tsx");

describe("عزل جدولة التقرير اليومي بين المشاريع", () => {
  it("يسجل كل تشغيل تقرير باسم مشروعه ويقيد التكرار على (المشروع، التاريخ)", () => {
    const block = schemaSource.slice(
      schemaSource.indexOf("export const reportSchedulerRuns"),
      schemaSource.indexOf("export type ReportSchedulerRun")
    );
    expect(block).toContain('projectId: int("project_id")');
    expect(block).toContain('uniqueIndex("report_scheduler_runs_project_date_uq").on(table.projectId, table.reportDate)');
    // القيد العالمي القديم على التاريخ وحده يجب ألا يبقى، وإلا فشل تشغيل المشروع الثاني.
    expect(block).not.toContain('.notNull().unique()');
  });

  it("تُنشئ الجدولة قيداً مركّباً وتُرقّي الجداول القديمة بأمان", () => {
    expect(schedulerSource).toContain("UNIQUE KEY report_scheduler_runs_project_date_uq (project_id, report_date)");
    expect(schedulerSource).toContain("ADD COLUMN project_id int NULL");
    expect(schedulerSource).toContain("DROP INDEX report_scheduler_runs_report_date_unique");
    expect(schedulerSource).toContain("ADD CONSTRAINT report_scheduler_runs_project_date_uq UNIQUE (project_id, report_date)");
  });

  it("تحتوي الهجرة على نفس الترقية دون حذف أي بيانات تشغيل", () => {
    expect(migrationSource).toContain("ADD COLUMN `project_id` int NULL");
    expect(migrationSource).toContain("DROP INDEX `report_scheduler_runs_report_date_unique`");
    expect(migrationSource).toContain("UNIQUE(`project_id`,`report_date`)");
    expect(migrationSource.toLowerCase()).not.toContain("delete from");
  });

  it("لكل مشروع مفاتيح إعدادات مستقلة مع رجوع للعام", () => {
    expect(scheduleSettingKeys(null)).toEqual({
      enabled: "report_schedule_enabled",
      time: "report_schedule_time",
      recipients: "report_recipients",
    });
    expect(scheduleSettingKeys(7)).toEqual({
      enabled: "report_schedule_enabled:7",
      time: "report_schedule_time:7",
      recipients: "report_recipients:7",
    });
    // الرجوع للإعداد العام حتى لا تتعطل المشاريع غير المضبوطة.
    expect(schedulerSource).toContain("if (scoped !== \"\") return scoped;");
    expect(schedulerSource).toContain("return getSettingValue(globalKey, fallback);");
  });

  it("قفل التشغيل منفصل لكل مشروع حتى لا يمنع مشروعٌ تشغيل مشروع آخر", () => {
    expect(reportLockName(null)).toBe("smart-inventory:daily-report:cairo");
    expect(reportLockName(1)).toBe("smart-inventory:daily-report:cairo:project-1");
    expect(reportLockName(2)).not.toBe(reportLockName(1));
  });

  it("يحصر بيانات التقرير (الأصناف والحركات والمباني) داخل المشروع", () => {
    expect(schedulerSource).toContain("const itemCondition = projectId != null ? eq(items.projectId, projectId) : undefined;");
    expect(schedulerSource).toContain("const movementCondition = projectId != null ? eq(disbursements.projectId, projectId) : undefined;");
    expect(schedulerSource).toContain("const buildingCondition = projectId != null ? eq(buildings.projectId, projectId) : undefined;");
    // ربط الصنف بالحركة يجب أن يكون داخل نفس المشروع لأن الأكواد تتكرر بين المشاريع.
    expect(schedulerSource).toContain(".leftJoin(items, and(eq(disbursements.itemCode, items.code), itemCondition))");
    expect(schedulerSource).toContain("getInventoryRows([], projectId)");
  });

  it("لا يُشعر إلا مدراء المشروع (والمدير العام) بأرقامه", () => {
    expect(schedulerSource).toContain("parseAllowedProjectIds(manager.allowedProjects).includes(projectId)");
    expect(schedulerSource).toContain('manager.role === "admin"');
  });

  it("يشغّل التقرير لكل مشروع نشط ويعزل فشل مشروع عن البقية", () => {
    expect(schedulerSource).toContain("listSchedulingProjects()");
    expect(schedulerSource).toContain("const targets: Array<SchedulingProject | null> = projectsToRun.length ? projectsToRun : [null];");
    expect(schedulerSource).toContain("for (const target of targets)");
    expect(schedulerSource).toContain("} catch (error: any) {");
    expect(schedulerSource).toContain('results.push({ projectId, projectName: target?.name ?? "", status: "failed"');
    expect(schedulerSource).toContain('executed > 0 ? "partial" : "failed"');
  });

  it("يضع اسم المشروع في موضوع البريد ورأس التقرير", () => {
    expect(schedulerSource).toContain("const projectPrefix = projectName ? `${projectName} — ` : \"\";");
    expect(schedulerSource).toContain("subject: `Smart Inventory — ${projectPrefix}التقرير التنفيذي اليومي ${today}`");
    expect(templateSource).toContain("projectName?: string;");
    expect(templateSource).toContain("المشروع: <b style=");
  });

  it("يبني رسالة التقرير باسم المشروع عند تمريره", () => {
    const base = {
      reportDate: "2026-11-04",
      thresholdPercentage: 20,
      inventoryTotal: 0,
      minimumStockItems: [],
      severeCodes: new Set<string>(),
      forecasts: [],
      buildingAlerts: [],
      unassigned: 0,
      totalTodayMovements: 0,
      summary: { permitCount: 0, lineCount: 0, correctionCount: 0, netValue: 0, quantityByUnit: [], items: [] },
    } as any;
    const withProject = buildDailyReportEmail({ ...base, projectName: "مشروع النخبة" });
    const withoutProject = buildDailyReportEmail(base);
    expect(withProject).toContain("مشروع النخبة");
    expect(withProject).toContain("مشروع النخبة — التقرير اليومي للمخزون");
    expect(withoutProject).not.toContain("مشروع النخبة");
    expect(withoutProject).not.toContain("المشروع:");
  });

  it("يمرر المشروع من الإعدادات ونقطة الحالة إلى الجدولة", () => {
    expect(routerSource).toContain("saveReportSchedulerConfig({ enabled: input.scheduleEnabled, time: input.scheduleTime, projectId: input.projectId ?? null })");
    expect(routerSource).toContain("getReportSchedulerConfig(input?.projectId ?? null)");
    expect(routerSource).toContain("runDailyExecutiveReport({ force: true, projectId: input?.projectId ?? null })");
    expect(scheduledSource).toContain("req.query?.projectId");
    expect(scheduledSource).toContain("const recipientsKey = projectId == null ? \"report_recipients\" : `report_recipients:${projectId}`;");
  });
  it("تمرر واجهة الإعدادات المشروع النشط إلى الجدولة وتقرأ قيمه أولاً", () => {
    expect(settingsPageSource).toContain("trpc.settings.reportSchedulerStatus.useQuery({ projectId: settingsActiveProject?.id ?? null })");
    expect(settingsPageSource).toContain("runDailyReportNow.mutate({ projectId: settingsActiveProject?.id ?? null })");
    expect(settingsPageSource).toContain("scheduleTime, projectId: settingsActiveProject?.id ?? null }");
    expect(settingsPageSource).toContain("const pickSetting = (key: string) => rows.find(item => item.key === `${key}${scopeSuffix}`) ?? rows.find(item => item.key === key);");
  });
});
