import { describe, expect, it } from "vitest";
import { getGlobalSearchRoute, parseGlobalVoiceSearch } from "./globalVoiceSearch";

describe("global voice search commands", () => {
  it("recognizes supplier account statement commands", () => {
    const command = parseGlobalVoiceSearch("افتح كشف حساب المورد النور");
    expect(command.intent).toBe("supplier-statement");
    expect(command.terms).toBe("النور");
  });

  it("recognizes item-card and movement commands", () => {
    expect(parseGlobalVoiceSearch("كارت حركة الصنف أسمنت").intent).toBe("item-card");
    expect(parseGlobalVoiceSearch("ابحث في أذونات الصرف عن أسمنت").intent).toBe("disbursements");
  });

  it("builds direct routes for item cards and account statements", () => {
    expect(getGlobalSearchRoute("item-card", "أسمنت", 7)).toBe("/items?card=7");
    expect(getGlobalSearchRoute("customer-statement", "شركة النور", 4)).toBe("/customers/4/statement");
  });
});
