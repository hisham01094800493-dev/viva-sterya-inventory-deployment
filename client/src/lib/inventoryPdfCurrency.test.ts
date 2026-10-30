import { describe, expect, it } from "vitest";
import { formatPdfCurrency } from "./inventoryExportFiles";

describe("formatPdfCurrency", () => {
  it("formats Egyptian-pound values with a stable Latin currency token", () => {
    expect(formatPdfCurrency(1234)).toBe("1,234.00 EGP");
    expect(formatPdfCurrency(1250.5)).toBe("1,250.50 EGP");
    expect(formatPdfCurrency(0)).toBe("0.00 EGP");
  });

  it("falls back to zero for invalid values", () => {
    expect(formatPdfCurrency("not-a-number")).toBe("0.00 EGP");
  });
});
