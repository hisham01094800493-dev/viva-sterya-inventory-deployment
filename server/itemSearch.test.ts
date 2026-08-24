import { describe, expect, it } from "vitest";
import { createItemSearchInput, ITEM_SEARCH_DEBOUNCE_MS, normalizeItemSearch } from "../client/src/lib/itemSearch";

describe("البحث السريع في الأصناف", () => {
  it("يطبع المسافات ويجهز مدخل البحث فقط عند وجود قيمة", () => {
    expect(normalizeItemSearch("  OFF-01   كرسي  ")).toBe("OFF-01 كرسي");
    expect(createItemSearchInput("   ")).toBeUndefined();
    expect(createItemSearchInput("  OFF-01  ")).toEqual({ search: "OFF-01" });
  });

  it("يستخدم تأخيراً قصيراً قبل إرسال البحث أثناء الكتابة", () => {
    expect(ITEM_SEARCH_DEBOUNCE_MS).toBe(220);
  });
});
