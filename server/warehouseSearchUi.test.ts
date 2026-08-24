import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("البحث السريع في اختيار المخازن", () => {
  it("يضيف حقل بحث ويخفي الخيارات غير المطابقة داخل القائمة", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/WarehouseMovementAssistant.tsx"), "utf8");
    expect(source).toContain('data-warehouse-search');
    expect(source).toContain("ابحث داخل قائمة المخازن...");
    expect(source).toContain("option.hidden");
  });
});
