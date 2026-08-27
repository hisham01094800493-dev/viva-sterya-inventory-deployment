import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("تنظيم الشاشة الرئيسية", () => {
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const layout = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");

  it("يحافظ على منطقة الترحيب ويضيف زر إنشاء صنف جديد بجوار إجراءاتها", () => {
    expect(home).toContain('className="home-hero relative overflow-hidden');
    expect(home).toContain('setLocation("/items?create=1")');
    expect(home).toContain("إضافة صنف جديد");
    expect(home).toContain("<QuickCalculator />");
    expect(home).toContain('aria-label="فتح الآلة الحاسبة"');
    expect(home.indexOf('className="home-hero relative overflow-hidden')).toBeLessThan(home.indexOf('className="grid grid-cols-3 gap-2.5'));
  });

  it("يعرض ثلاث مؤشرات مختصرة ثم خطًا زمنيًا بعرض كامل قبل التفاصيل المطوية", () => {
    expect(home).toContain('className="grid grid-cols-3 gap-2.5 sm:gap-3"');
    expect(home).toContain('className="home-surface overflow-hidden rounded-2xl');
    expect(home).toContain("إجمالي المنصرف");
    expect(home).toContain('details className="home-surface group');
    expect(home).not.toContain("STOCK ALERTS");
  });

  it("يعرّف أسطحًا وألوانًا واضحة للبطاقات والمرشحات في الوضع الليلي", () => {
    expect(styles).toContain(".dark .home-timeline-range");
    expect(styles).toContain(".dark .home-timeline-select");
    expect(styles).toContain(".dark .home-timeline-metric--incoming");
    expect(styles).toContain(".dark .home-timeline-metric--outgoing");
    expect(styles).toContain(".dark .home-timeline-metric--transfer");
  });

  it("يبقي إشعارات الشريط والاختصارات العائمة والمحادثات ضمن الغلاف العام", () => {
    expect(layout).toContain("<NotificationBell");
    expect(layout).toContain("<FloatingQuickActions");
    expect(layout).toContain("<ChatFloatingBubble />");
    expect(home).not.toContain("FloatingQuickActions");
    expect(home).not.toContain("ChatFloatingBubble");
  });
});
