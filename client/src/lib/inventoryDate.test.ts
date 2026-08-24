import { describe, expect, it } from "vitest";
import { formatInventoryDate, inventoryDateKey } from "./inventoryDate";

describe("inventory date formatting", () => {
  it("converts an Excel serial date to a readable date", () => {
    expect(formatInventoryDate(46242)).toBe("08/08/2026");
    expect(inventoryDateKey(46242)).toBe("2026-08-08");
  });

  it("formats ISO dates without timezone drift", () => {
    expect(formatInventoryDate("2026-01-13")).toBe("13/01/2026");
    expect(inventoryDateKey("2026/01/13")).toBe("2026-01-13");
  });

  it("accepts Arabic numeric serial dates", () => {
    expect(formatInventoryDate("٤٦٢٤٢")).toBe("08/08/2026");
  });

  it("expands compact day-month values instead of treating them as Excel serials", () => {
    expect(formatInventoryDate("0506").slice(0, 5)).toBe("05/06");
    expect(formatInventoryDate("05062026")).toBe("05/06/2026");
    expect(formatInventoryDate("20260506")).toBe("06/05/2026");
  });
});
