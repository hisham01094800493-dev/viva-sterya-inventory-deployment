import { describe, expect, it } from "vitest";
import { assertWarehouseBelongsToProject } from "./db";

describe("عزل مخزن الصنف عن المشروع النشط", () => {
  it("يسمح بالمخزن التابع للمشروع النشط", () => {
    expect(() =>
      assertWarehouseBelongsToProject({ id: 10, projectId: 7 }, 7),
    ).not.toThrow();
  });

  it("يرفض المخزن التابع لمشروع مختلف", () => {
    expect(() =>
      assertWarehouseBelongsToProject({ id: 10, projectId: 8 }, 7),
    ).toThrow("المخزن المحدد لا يتبع المشروع النشط");
  });

  it("يحافظ على توافق البيانات القديمة عندما لا يوجد مشروع نشط", () => {
    expect(() =>
      assertWarehouseBelongsToProject({ id: 10, projectId: null }, null),
    ).not.toThrow();
  });
});
