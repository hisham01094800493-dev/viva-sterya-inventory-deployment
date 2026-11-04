import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * اختبارات تعاقدية لعزل التقارير (المرحلة 6).
 *
 * الهدف: منع أي تراجع (regression) يعيد خلط بيانات المشاريع داخل التقارير والتصدير.
 * نقرأ الكود المصدري ونتحقق من أن:
 *  1) استعلام صرف اليوم محصور بالمشروع ويُربط الصنف على (project_id, code) لا على الكود وحده.
 *  2) استعلام خيارات الفلاتر في مجموعة التقارير يمرّر projectId.
 *  3) تشغيل التقرير يمرّر projectId إلى الأصناف/الصرف/التوقعات.
 *  4) بانيي HTML يعرضان اسم المشروع.
 *  5) الواجهة تُلحق اسم المشروع بالعنوان وباسم الملف.
 */

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 6 — report & export isolation contract", () => {
  const dbSource = read("server/db.ts");
  const reportsSource = read("server/inventoryReports.ts");
  const pageSource = read("client/src/pages/ReportsPage.tsx");

  it("getDailyDisbursementRows accepts projectId and allowed warehouses", () => {
    expect(dbSource).toMatch(
      /export async function getDailyDisbursementRows\(\s*reportDate: string,\s*allowedWarehouseIds: number\[\] = \[\],\s*projectId\?: number \| null,?\s*\)/,
    );
  });

  it("daily disbursement item join is composite (project_id, code) when scoped", () => {
    const start = dbSource.indexOf("export async function getDailyDisbursementRows");
    expect(start).toBeGreaterThan(-1);
    const body = dbSource.slice(start, start + 2500);
    expect(body).toContain("eq(disbursements.itemCode, items.code)");
    expect(body).toContain("eq(items.projectId, projectId)");
    expect(body).toContain("eq(disbursements.projectId, projectId)");
    expect(body).toContain("inArray(disbursements.warehouseId, allowedWarehouseIds)");
  });

  it("report filter options query receives the project scope", () => {
    expect(dbSource).toContain(
      "const optionWhere = reportWhereConditions(optionInput, allowedWarehouseIds, projectId);",
    );
  });

  it("runInventoryReport scopes inventory rows, daily disbursements and forecasts by project", () => {
    const start = reportsSource.indexOf("export async function runInventoryReport");
    expect(start).toBeGreaterThan(-1);
    const body = reportsSource.slice(start, start + 2000);
    expect(body).toContain("const scopedProjectId = projectId ?? null;");
    expect(body).toContain("getInventoryRows([], scopedProjectId)");
    expect(body).toContain("getDailyDisbursementRows(reportDate, [], scopedProjectId)");
    expect(body).toContain("getForecastRows([], { leadTimeDays: 7, safetyStockDays: 3 }, scopedProjectId)");
  });

  it("runInventoryReport passes project name into the email subject and both HTML builders", () => {
    const start = reportsSource.indexOf("export async function runInventoryReport");
    const body = reportsSource.slice(start, start + 3000);
    expect(body).toContain("projectName?.trim() ? ` — ${projectName.trim()}` : \"\"");
    expect(body).toContain("buildDailyInventoryReportHtml(rows, thresholdPercentage, dailySummary, reportDate, forecastRows, projectName)");
    expect(body).toContain("buildInventoryReportHtml(reportRows, thresholdPercentage, title, projectName)");
  });

  it("HTML report builders render a project badge", () => {
    expect(reportsSource).toContain("export function buildInventoryReportHtml(rows: InventoryReportRow[], thresholdPercentage: number, title: string, projectName?: string | null)");
    expect(reportsSource).toContain("export function buildDailyInventoryReportHtml(");
    expect(reportsSource).toContain("projectName?: string | null,");
    expect(reportsSource).toContain("const projectLine = projectName?.trim()");
    expect(reportsSource).toContain("المشروع: ${escapeHtml(projectName.trim())}");
  });

  it("client report titles and file names carry the active project name", () => {
    expect(pageSource).toContain("export function withReportProject(title: string, projectName?: string | null)");
    expect(pageSource).toContain("export function withReportProjectFile(fileName: string, projectName?: string | null)");
    expect(pageSource).toContain("const activeProjectName = activeProjectState.resolved.project ? projectLabel(activeProjectState.resolved.project) : \"\";");
    expect(pageSource).not.toMatch(/savePdfFile\([^)]*,\s*"smart-inventory-[a-z-]+\.pdf"\s*\)/);
    expect(pageSource).not.toMatch(/downloadBlobFile\([^)]*,\s*"smart-inventory-[a-z-]+\.(xlsx|csv)"\s*\)/);
  });
});
