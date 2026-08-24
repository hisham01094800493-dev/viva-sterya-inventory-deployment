import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("التفاصيل المالية في صفحة الأصناف", () => {
  it("يخفي سعر الوحدة افتراضيًا ويعيده للمخوّل عند التفعيل", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

    expect(page).toContain('"inventory-financial-details-v1"');
    expect(page).toContain('const showInventoryFinancialDetails = canViewInventoryFinancialDetails && inventoryFinancialPreferenceVisible');
    expect(page).toContain('showInventoryFinancialDetails ? <th className="px-4 py-4">السعر</th> : null');
    expect(page).toContain('showFinancialDetails={showInventoryFinancialDetails}');
    expect(page).toContain('movement-financial-toggle');
    expect(router).toContain('items: result.items.map(({ unitPrice: _unitPrice, ...item }) => item)');
    expect(styles).toContain('.inventory-items-table');
    expect(styles).toContain('.dark .inventory-items-table');
  });
});
