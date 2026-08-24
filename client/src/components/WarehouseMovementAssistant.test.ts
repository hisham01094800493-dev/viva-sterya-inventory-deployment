import { describe, expect, it } from "vitest";
import { warehouseSelectionValidity } from "./WarehouseMovementAssistant";

describe("التحقق من اختيار المخزن", () => {
  const warehouses = ["المخزن الرئيسي", "فرع المبيعات", "مخزن الهالك"];

  it("يقبل المخزن المسجل ويمنع الاسم اليدوي غير المعتمد", () => {
    expect(warehouseSelectionValidity("المخزن الرئيسي", warehouses)).toBe("");
    expect(warehouseSelectionValidity("مخزن غير مسجل", warehouses)).toBe("اختر مخزناً من القائمة المعتمدة");
  });

  it("يبقي الحقل الفارغ للمعالجة بواسطة حقل النموذج الإلزامي", () => {
    expect(warehouseSelectionValidity("", warehouses)).toBe("");
  });
});
