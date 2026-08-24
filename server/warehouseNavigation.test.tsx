import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildWarehouseNavigationItems, WarehouseNavigationList } from "../client/src/components/DashboardLayout";

describe("واجهة قائمة المخازن", () => {
  it("تعرض المكوّن الفعلي خمسة روابط بالمخازن وأسماءها المخصصة", () => {
    const items = buildWarehouseNavigationItems([1, 2, 3, 4, 5].map(slot => ({ slot, name: slot === 2 ? "مخزن قطع الغيار" : `المخزن ${slot}` })));
    const markup = renderToStaticMarkup(<WarehouseNavigationList items={items} activePath="/warehouses/2" onNavigate={vi.fn()} />);
    expect(markup).toContain("المخزن 1");
    expect(markup).toContain("مخزن قطع الغيار");
    expect(markup).toContain("المخزن 5");
    expect(markup.match(/المخزن|قطع الغيار/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("تطبق نسخة الوضع الداكن تنسيقاً متبايناً على الروابط", () => {
    const items = buildWarehouseNavigationItems([{ slot: 1, name: "المخزن الرئيسي" }]);
    const markup = renderToStaticMarkup(<WarehouseNavigationList items={items} activePath="/warehouses/1" onNavigate={vi.fn()} darkMode />);
    expect(markup).toContain("bg-[#21465a]");
    expect(markup).toContain("text-white");
  });
});
