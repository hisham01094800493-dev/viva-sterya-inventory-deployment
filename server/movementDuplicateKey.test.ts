import { describe, expect, it } from "vitest";
import { buildMovementDuplicateKey, isReturnTransfer, type MovementImportRow } from "./db";

const base: MovementImportRow = {
  type: "disbursement",
  date: "2026-01-13",
  eznNum: "20003",
  itemCode: "20003",
  quantity: 8.085,
  destination: "الصعيدى (سكوير)",
  notes: "حائط بينL2&L1",
};

describe("مفتاح تمييز حركات الاستيراد", () => {
  it("يعتبر اختلاف الجهة المستلمة حركة مستقلة", () => {
    const other = { ...base, destination: "سيفل" };
    expect(buildMovementDuplicateKey(base)).not.toBe(buildMovementDuplicateKey(other));
  });

  it("يعتبر اختلاف الملاحظات حركة مستقلة", () => {
    const other = { ...base, notes: "L4&L5" };
    expect(buildMovementDuplicateKey(base)).not.toBe(buildMovementDuplicateKey(other));
  });

  it("يبقي الحركة المتطابقة فعلياً على نفس المفتاح", () => {
    expect(buildMovementDuplicateKey(base)).toBe(buildMovementDuplicateKey({ ...base }));
  });

  it("يعامل مرتجع من عميل كنوع مرتجع مستقل يزيد الرصيد", () => {
    expect(isReturnTransfer("مرتجع من عميل")).toBe(true);
    expect(isReturnTransfer("مرتجع")).toBe(true);
    expect(isReturnTransfer("transfer")).toBe(false);
  });
});
