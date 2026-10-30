import { describe, expect, it } from "vitest";
import { dashboardQueryOptions, inventoryQueryOptions, limitRows } from "../client/src/lib/queryOptions";

describe("إعدادات أداء جلب البيانات", () => {
  it("يمنع إعادة الجلب التلقائي المتكرر ويحتفظ بالبيانات مؤقتاً", () => {
    expect(inventoryQueryOptions.staleTime).toBe(15_000);
    expect(inventoryQueryOptions.gcTime).toBe(5 * 60_000);
    expect(inventoryQueryOptions.refetchOnWindowFocus).toBe(true);
    expect(inventoryQueryOptions.refetchOnReconnect).toBe(true);
    expect(dashboardQueryOptions.staleTime).toBe(10_000);
  });

  it("يقص البيانات المعروضة دون تعديل المصدر", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(limitRows(rows, 2)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(rows).toHaveLength(3);
    expect(limitRows(undefined, 2)).toEqual([]);
  });
});
