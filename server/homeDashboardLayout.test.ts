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
    expect(home.indexOf('className="home-hero relative overflow-hidden')).toBeLessThan(home.indexOf('aria-label="مركز العمل اليومي"'));
  });

  it("يجمع المؤشرات في بطاقة واحدة ويعرض قسماً واحداً متحركاً عند الاختيار", () => {
    expect(home).toContain('aria-label="مركز العمل اليومي"');
    expect(home).toContain('className="mt-3 flex gap-1 overflow-x-auto rounded-xl');
    expect(home).toContain('workCenterView === "movement"');
    expect(home).toContain('workCenterView === "stagnant"');
    expect(home).toContain('workCenterView === "operations"');
    expect(home).toContain("AnimatePresence mode=\"wait\"");
    expect(home).toContain("ملخص سريع؛ اختر القسم لعرض تفاصيله.");
    expect(home).toContain('details className="home-latest-ticker home-surface group');
    expect(home).not.toContain("STOCK ALERTS");
  });

  it("يعرّف أسطحًا وألوانًا واضحة للبطاقات والمرشحات في الوضع الليلي", () => {
    expect(styles).toContain(".dark .home-timeline-range");
    expect(styles).toContain(".dark .home-timeline-select");
    expect(styles).toContain(".dark .home-timeline-metric--incoming");
    expect(styles).toContain(".dark .home-timeline-metric--outgoing");
    expect(styles).toContain(".dark .home-timeline-metric--transfer");
    expect(styles).toContain(".dark .home-calculator-display");
    expect(styles).toContain("color: #f4f8fb !important");
  });

  it("يبقي إشعارات الشريط والاختصارات العائمة والمحادثات ضمن الغلاف العام", () => {
    expect(layout).toContain("<NotificationBell");
    expect(layout).toContain("<FloatingQuickActions");
    expect(layout).toContain("<ChatFloatingBubble />");
    expect(home).not.toContain("FloatingQuickActions");
    expect(home).not.toContain("ChatFloatingBubble");
  });
});
