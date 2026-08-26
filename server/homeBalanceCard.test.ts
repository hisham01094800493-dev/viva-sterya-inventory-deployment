import { describe, expect, it } from "vitest";
import { getCurrentBalanceCardDetails, getDashboardLatestPermitDetails, getLatestPermitCardDetail, getMovementSeriesTotals, getWarehouseItemCountDetails } from "../client/src/pages/Home";

describe("تفاصيل بطاقة الرصيد الحالي", () => {
  it("يعرض الكمية والوحدة واسم الصنف ذي الرصيد", () => {
    expect(getCurrentBalanceCardDetails([{ id: 150001, code: "20001", name: "حديد تسليح كانات 8 مم", unit: "طن", currentStock: "2.000" }])).toEqual({ value: "2 طن", detail: "طن متاحة", itemsWithBalance: [{ id: 150001, code: "20001", name: "حديد تسليح كانات 8 مم" }], extraItemsCount: 0 });
  });

  it("يوضح أن الرصيد بوحدات متعددة عند اختلاف الوحدات", () => {
    const details = getCurrentBalanceCardDetails([{ name: "صنف أول", unit: "طن", currentStock: 2 }, { name: "صنف ثان", unit: "قطعة", currentStock: 3 }]);
    expect(details.value).toBe("5");
    expect(details.detail).toBe("رصيد بوحدات متعددة");
    expect(details.itemsWithBalance).toEqual([{ id: undefined, code: "—", name: "صنف أول" }, { id: undefined, code: "—", name: "صنف ثان" }]);
  });

  it("يعرض أول ثلاثة أصناف ويحسب الأصناف الإضافية", () => {
    const details = getCurrentBalanceCardDetails([1, 2, 3, 4].map(id => ({ id, code: `20${id}`, name: `صنف ${id}`, unit: "طن", currentStock: 1 })));
    expect(details.itemsWithBalance).toHaveLength(3);
    expect(details.extraItemsCount).toBe(1);
  });

  it("يوزع إجمالي الأصناف على المخازن التي تحتوي أصنافاً فقط", () => {
    const details = getWarehouseItemCountDetails([{ id: 1, slot: 1, name: "المخزن الرئيسي" }, { id: 2, slot: 2, name: "الفرع الأول" }, { id: 3, slot: 3, name: "الفرع الثاني" }], [{ warehouseId: 1, count: 6 }, { warehouseId: 2, count: 1 }, { warehouseId: 3, count: 2 }]);
    expect(details).toEqual([{ id: 1, name: "المخزن الرئيسي", count: 6 }, { id: 2, name: "الفرع الأول", count: 1 }, { id: 3, name: "الفرع الثاني", count: 2 }]);
  });

  it("يعرض آخر إذن وارد أو صرف برقم الإذن وتاريخه", () => {
    expect(getLatestPermitCardDetail("incoming", { eznNum: "512", date: "2026-08-22" })).toContain("آخر إذن الوارد: 512");
    expect(getLatestPermitCardDetail("outgoing", { eznNum: "613", date: "2026-08-21" })).toContain("آخر إذن الصرف: 613");
  });

  it("لا يتعطل عند وجود ملخص لوحة تحكم قديم بلا بيانات آخر الأذونات", () => {
    expect(getDashboardLatestPermitDetails()).toEqual({ incoming: "لا يوجد إذن الوارد مسجل", outgoing: "لا يوجد إذن الصرف مسجل" });
  });

  it("يجمع وارد الرسم من نقاط المدة المعروضة فقط دون إدخال الحركات الأقدم", () => {
    expect(getMovementSeriesTotals([
      { additions: "2.500", disbursements: 1, transfers: 0 },
      { additions: 4, disbursements: "0.750", transfers: 3 },
    ])).toEqual({ additions: 6.5, disbursements: 1.75, transfers: 3 });
  });
});
