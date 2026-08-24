import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryFilterBar } from "../client/src/components/InventoryFilterBar";

describe("واجهة البحث والتصفية في المخزون", () => {
  it("تعرض حقل البحث وخيارات التصنيف والحالة للمستخدم", () => {
    const markup = renderToStaticMarkup(<InventoryFilterBar searchInput="" categoryFilter="all" stockFilter="all" sortBy="name" categories={["أثاث", "قرطاسية"]} visibleCount={2} onSearchChange={vi.fn()} onCategoryChange={vi.fn()} onStockChange={vi.fn()} onSortChange={vi.fn()} />);
    expect(markup).toContain("بحث سريع بالكود أو اسم الصنف");
    expect(markup).toContain("أثاث");
    expect(markup).toContain("قرطاسية");
    expect(markup).toContain("منخفض المخزون");
  });
});
