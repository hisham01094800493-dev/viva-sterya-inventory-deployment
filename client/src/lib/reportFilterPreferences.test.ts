import { describe, expect, it } from "vitest";
import { clearReportFilterSnapshot, readReportFilterSnapshot, writeReportFilterSnapshot, type ReportFilterSnapshot } from "./reportFilterPreferences";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const snapshot: Omit<ReportFilterSnapshot, "savedAt"> = {
  reportType: "movements", from: "2026-01-01", to: "2026-01-31", movement: "صرف", variance: "all", unlinked: "", permit: "18", itemCode: "20002", itemName: "حديد", warehouse: "", incomingFrom: "", outgoingTo: "التهامي", additionPurpose: "", disbursementPurpose: "مقاول", returnPurpose: "",
};

describe("report filter preferences", () => {
  it("round-trips a user's last filters", () => {
    const store = storage();
    writeReportFilterSnapshot(store, 7, snapshot);
    expect(readReportFilterSnapshot(store, 7)).toMatchObject(snapshot);
    expect(readReportFilterSnapshot(store, 7)?.savedAt).toEqual(expect.any(String));
  });

  it("keeps filters isolated between users and can clear them", () => {
    const store = storage();
    writeReportFilterSnapshot(store, 7, snapshot);
    expect(readReportFilterSnapshot(store, 8)).toBeNull();
    clearReportFilterSnapshot(store, 7);
    expect(readReportFilterSnapshot(store, 7)).toBeNull();
  });

  it("rejects malformed stored values", () => {
    const store = storage();
    store.setItem("smart-inventory-report-filters-v1:7", JSON.stringify({ reportType: "movements" }));
    expect(readReportFilterSnapshot(store, 7)).toBeNull();
  });
});
