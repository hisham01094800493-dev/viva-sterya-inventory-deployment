import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("فتح كارت الصنف من لوحة Home", () => {
  it("يفتح كارت الصنف من نتائج البحث السريع مع إبقاء رابط القائمة مدعوماً", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const items = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
    expect(home).toContain("setSelectedItemCardId(item.id)");
    expect(home).toContain("setItemCardOpen(true)");
    expect(items).toContain('get("card")');
    expect(items).toContain("setCardOpen(true)");
  });
});
