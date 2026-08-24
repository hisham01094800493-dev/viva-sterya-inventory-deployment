import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK_ACTIONS, normalizeQuickActions, normalizeReportColumnOrder, parseQuickActions } from "@shared/userPreferences";

describe("user preferences", () => {
  it("keeps only supported quick actions and removes duplicates", () => {
    expect(normalizeQuickActions(["/transfers", "/transfers", "/unknown", "/additions"])).toEqual(["/transfers", "/additions"]);
  });

  it("falls back safely when stored JSON is invalid or empty", () => {
    expect(parseQuickActions("not-json")).toEqual([...DEFAULT_QUICK_ACTIONS]);
    expect(parseQuickActions("[]")).toEqual([...DEFAULT_QUICK_ACTIONS]);
  });

  it("normalizes saved report column order per report key", () => {
    expect(normalizeReportColumnOrder({ "movements:transfers": ["name", "date", "name"], broken: ["name", 7], invalid: "name" })).toEqual({ "movements:transfers": ["name", "date"] });
    expect(normalizeReportColumnOrder("not-an-object")).toEqual({});
  });
});
