import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const inventorySource = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const pageStart = inventorySource.indexOf("export function AlertsPage()");
const pageEnd = inventorySource.indexOf("\nfunction parseReportRunSummary", pageStart);
const alertsPage = inventorySource.slice(pageStart, pageEnd);
const renderedPage = alertsPage.slice(alertsPage.indexOf("return (\n    <DashboardLayout>"));

describe("ترتيب صفحة التنبيهات الذكية", () => {
  it("يعرض جدول حد المخزون وتنبيهات الدخول وسجل القراءة قبل التوقعات الطويلة", () => {
    expect(pageStart).toBeGreaterThanOrEqual(0);
    expect(pageEnd).toBeGreaterThan(pageStart);
    expect(renderedPage.indexOf("{lowStockCard}")).toBeLessThan(renderedPage.indexOf("<SmartForecastCard />"));
    expect(renderedPage.indexOf("{isAdmin ? securityAlertsCard : null}")).toBeLessThan(renderedPage.indexOf("<SmartForecastCard />"));
    expect(renderedPage.indexOf("{isAdmin ? sentNotificationsCard : null}")).toBeLessThan(renderedPage.indexOf("<SmartForecastCard />"));
  });

  it("يقسم توقعات المخزون إلى صفحات صغيرة ويعرض أزرار التنقل", () => {
    expect(inventorySource).toContain("const pageSize = 8;");
    expect(inventorySource).toContain("pageSize,");
    expect(inventorySource).toContain("عرض {firstResult}–{lastResult} من {total} صنف");
    expect(inventorySource).toContain("السابقة");
    expect(inventorySource).toContain("التالية");
  });

  it("يعالج فلتر الأصناف الراكدة من الخادم حتى يعمل الترقيم بدقة", () => {
    expect(inventorySource).toContain('stagnant: severity === "stagnant" ? true : undefined');
    expect(routerSource).toContain("stagnant: z.boolean().optional()");
    expect(routerSource).toContain("(!input.stagnant || row.stagnant)");
  });

  it("يعرض حالة القراءة وتاريخ التنبيه بصيغة عربية", () => {
    expect(alertsPage).toContain('notification.isRead ? "تمت القراءة" : "جديد"');
    expect(alertsPage).toContain('toLocaleString("ar-EG")');
    expect(alertsPage).toContain("max-h-[25rem] space-y-2 overflow-y-auto");
  });
});
