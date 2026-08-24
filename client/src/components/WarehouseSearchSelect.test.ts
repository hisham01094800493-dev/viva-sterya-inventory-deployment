import { describe, expect, it } from "vitest";
import { filterWarehouseSearchOptions } from "./WarehouseSearchSelect";

describe("البحث في قائمة المخازن", () => {
  const options = [{ value: "1", label: "المخزن الرئيسي" }, { value: "2", label: "فرع المبيعات" }, { value: "3", label: "مخزن الهالك" }];

  it("يعيد المخازن المطابقة لجزء من الاسم", () => {
    expect(filterWarehouseSearchOptions(options, "فرع")).toEqual([{ value: "2", label: "فرع المبيعات" }]);
  });

  it("يعيد جميع المخازن عندما يكون البحث فارغاً", () => {
    expect(filterWarehouseSearchOptions(options, "")).toHaveLength(3);
  });
});
