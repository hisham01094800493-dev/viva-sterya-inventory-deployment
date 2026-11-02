import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const inventorySource = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
const governanceSource = readFileSync(resolve(process.cwd(), "client/src/pages/GovernancePage.tsx"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const pageStart = inventorySource.indexOf("export function AlertsPage()");
const pageEnd = inventorySource.indexOf("\nfunction parseReportRunSummary", pageStart);
const alertsPage = inventorySource.slice(pageStart, pageEnd);
const renderedPage = alertsPage.slice(alertsPage.indexOf("return (\n    <DashboardLayout>"));

describe("ترتيب صفحة التنبيهات الذكية", () => {
  it("يعرض الأصناف الحرجة والتوقعات والطلبات أولاً ويؤخر مركز الإشعارات إلى نهاية الصفحة", () => {
    expect(pageStart).toBeGreaterThanOrEqual(0);
    expect(pageEnd).toBeGreaterThan(pageStart);
    expect(renderedPage.indexOf("{lowStockCard}")).toBeLessThan(renderedPage.indexOf("<SmartForecastCard />"));
    expect(renderedPage.indexOf("<SmartForecastCard />")).toBeLessThan(renderedPage.indexOf("<HelpRequestsAdminCard />"));
    expect(renderedPage.indexOf("<HelpRequestsAdminCard />")).toBeLessThan(renderedPage.indexOf("customNotificationCard"));
    expect(renderedPage.indexOf("customNotificationCard")).toBeLessThan(renderedPage.indexOf("sentNotificationsCard"));
    expect(alertsPage).not.toContain("securityNotifications");
    expect(governanceSource).toContain("function LoginSecurityNotificationsCard()");
    expect(governanceSource).toContain('tab === "logins" && user?.role === "admin" && <LoginSecurityNotificationsCard />');
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

  it("يعرض حالة قراءة تنبيهات الدخول وتاريخها بصيغة عربية ضمن سجل الحماية", () => {
    expect(governanceSource).toContain('notification.isRead ? "تمت القراءة" : "جديد"');
    expect(governanceSource).toContain('toLocaleString("ar-EG")');
    expect(governanceSource).toContain("max-h-[25rem] space-y-2 overflow-y-auto");
  });
});
