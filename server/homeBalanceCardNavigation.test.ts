import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("فتح كارت الصنف من بطاقة الرصيد", () => {
  it("يربط اسم الصنف بكارت الصنف عبر معلمة الرابط", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const items = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
    expect(home).toContain("/items?card=${item.id}");
    expect(items).toContain('get("card")');
    expect(items).toContain("setCardOpen(true)");
  });
});
