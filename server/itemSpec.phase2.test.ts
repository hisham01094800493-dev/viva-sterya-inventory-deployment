import { describe, expect, it } from "vitest";
import {
  clearSpecFieldsForType,
  formatItemDisplayName,
  formatItemSpecLabel,
  normalizeItemSpec,
  parseSizeSearchQuery,
  predictSequentialCodes,
  specFieldVisibility,
} from "@shared/itemSpec";
import { filterInventoryItems, type InventoryFilterItem } from "../client/src/lib/itemFilters";
import { InventoryError, normalizeItemSpecOrThrow } from "./db";

describe("ظهور حقول المواصفات حسب نوع الصنف", () => {
  it("الصنف العادي لا يعرض أي حقل مواصفات", () => {
    expect(specFieldVisibility("general")).toEqual({ size: false, tone: false, thickness: false });
  });

  it("السيراميك يعرض المقاس والتون فقط دون السُمك", () => {
    expect(specFieldVisibility("ceramic")).toEqual({ size: true, tone: true, thickness: false });
  });

  it("الرخام يعرض المقاس والسُمك فقط دون التون", () => {
    expect(specFieldVisibility("marble")).toEqual({ size: true, tone: false, thickness: true });
  });
});

describe("مسح القيم غير المتوافقة عند تغيير النوع", () => {
  const ceramicValue = {
    itemType: "ceramic" as const,
    sizeLengthCm: "30",
    sizeWidthCm: "60",
    tone: "101",
    thicknessCm: "2",
  };

  it("التحويل إلى عادي يمسح المقاس والتون والسُمك", () => {
    expect(clearSpecFieldsForType(ceramicValue, "general")).toEqual({
      itemType: "general",
      sizeLengthCm: "",
      sizeWidthCm: "",
      tone: "",
      thicknessCm: "",
    });
  });

  it("التحويل إلى سيراميك يمسح السُمك ويبقي المقاس والتون", () => {
    const marbleValue = { ...ceramicValue, itemType: "marble" as const, tone: "101", thicknessCm: "3" };
    expect(clearSpecFieldsForType(marbleValue, "ceramic")).toMatchObject({
      itemType: "ceramic",
      sizeLengthCm: "30",
      sizeWidthCm: "60",
      tone: "101",
      thicknessCm: "",
    });
  });

  it("التحويل إلى رخام يمسح التون ويبقي المقاس والسُمك", () => {
    expect(clearSpecFieldsForType(ceramicValue, "marble")).toMatchObject({
      itemType: "marble",
      sizeLengthCm: "30",
      sizeWidthCm: "60",
      tone: "",
      thicknessCm: "2",
    });
  });
});

describe("التحقق على الخادم من توافق المواصفات", () => {
  it("يرفض صنفًا عاديًا يحمل مقاسًا", () => {
    expect(() => normalizeItemSpecOrThrow({ itemType: "general", sizeLengthCm: 30 })).toThrow(InventoryError);
    try {
      normalizeItemSpecOrThrow({ itemType: "general", sizeLengthCm: 30 });
    } catch (error) {
      expect((error as InventoryError).kind).toBe("BAD_REQUEST");
    }
  });

  it("يرفض سيراميك بسُمك", () => {
    expect(() =>
      normalizeItemSpecOrThrow({ itemType: "ceramic", sizeLengthCm: 30, sizeWidthCm: 60, thicknessCm: 2 })
    ).toThrow(InventoryError);
  });

  it("يرفض رخامًا بتون", () => {
    expect(() =>
      normalizeItemSpecOrThrow({ itemType: "marble", sizeLengthCm: 130, sizeWidthCm: 20, tone: "101" })
    ).toThrow(InventoryError);
  });

  it("يرفض السيراميك دون إدخال الطول والعرض معًا", () => {
    expect(() => normalizeItemSpecOrThrow({ itemType: "ceramic", sizeLengthCm: 30 })).toThrow(InventoryError);
  });

  it("يقبل سيراميكًا صحيحًا ويطبّع القيم", () => {
    expect(
      normalizeItemSpecOrThrow({ itemType: "ceramic", sizeLengthCm: 30, sizeWidthCm: "60", tone: " 101 " })
    ).toEqual({
      itemType: "ceramic",
      sizeLengthCm: "30.00",
      sizeWidthCm: "60.00",
      tone: "101",
      thicknessCm: null,
      specGroupKey: null,
    });
  });

  it("يقبل رخامًا بسُمك ويحفظه بمنزلتين", () => {
    expect(
      normalizeItemSpecOrThrow({ itemType: "marble", sizeLengthCm: 130, sizeWidthCm: 20, thicknessCm: 3 })
    ).toMatchObject({ itemType: "marble", sizeLengthCm: "130.00", sizeWidthCm: "20.00", thicknessCm: "3.00", tone: null });
  });

  it("يحفظ مفتاح تجميع المواصفات كما هو", () => {
    expect(
      normalizeItemSpec({ itemType: "ceramic", sizeLengthCm: 30, sizeWidthCm: 60, specGroupKey: "group-1" })
    ).toMatchObject({ specGroupKey: "group-1" });
  });
});

describe("توليد أكواد مستقلة لكل صف مواصفات", () => {
  it("يولّد أكوادًا متتالية بلا تكرار", () => {
    expect(predictSequentialCodes("10001", 3)).toEqual(["10001", "10002", "10003"]);
    expect(new Set(predictSequentialCodes("10001", 3)).size).toBe(3);
  });

  it("يحافظ على عرض الأصفار في الكود", () => {
    expect(predictSequentialCodes("SI-000007", 2)).toEqual(["SI-000007", "SI-000008"]);
  });

  it("يعيد قائمة فارغة القيم عند غياب الكود الأساسي", () => {
    expect(predictSequentialCodes(undefined, 2)).toEqual(["", ""]);
  });
});

describe("تمييز الأصناف المتشابهة بالاسم واختلاف المواصفات", () => {
  it("يعرض الاسم الكامل مع المقاس والتون للسيراميك", () => {
    expect(
      formatItemDisplayName("سيراميك أبيض", { itemType: "ceramic", sizeLengthCm: "30", sizeWidthCm: "60", tone: "101" })
    ).toBe("سيراميك أبيض — 30×60 سم — تون 101");
  });

  it("يعرض الاسم الكامل مع المقاس والسُمك للرخام", () => {
    expect(
      formatItemDisplayName("رخام كريمي", { itemType: "marble", sizeLengthCm: "130", sizeWidthCm: "20", thicknessCm: "2" })
    ).toBe("رخام كريمي — 130×20 سم — سُمك 2 سم");
  });

  it("يختلف الوصف بين مواصفتين مختلفتين لنفس الاسم", () => {
    const first = formatItemDisplayName("سيراميك", { itemType: "ceramic", sizeLengthCm: 30, sizeWidthCm: 60, tone: "101" });
    const second = formatItemDisplayName("سيراميك", { itemType: "ceramic", sizeLengthCm: 30, sizeWidthCm: 60, tone: "202" });
    expect(first).not.toBe(second);
  });

  it("لا يعرض وصف مواصفات للصنف العادي", () => {
    expect(formatItemSpecLabel({ itemType: "general" })).toBeNull();
    expect(formatItemDisplayName("صنف عادي", { itemType: "general" })).toBe("صنف عادي");
  });
});

describe("البحث بالمقاس والتون والسُمك", () => {
  it("يحلّل صيغ المقاس المختلفة", () => {
    expect(parseSizeSearchQuery("30×60")).toEqual({ first: "30", second: "60" });
    expect(parseSizeSearchQuery("30x60")).toEqual({ first: "30", second: "60" });
    expect(parseSizeSearchQuery(" 30 * 60 ")).toEqual({ first: "30", second: "60" });
    expect(parseSizeSearchQuery("30.5×60.25")).toEqual({ first: "30.5", second: "60.25" });
  });

  it("يعيد null للاستعلامات غير المقاسة", () => {
    expect(parseSizeSearchQuery("سيراميك")).toBeNull();
    expect(parseSizeSearchQuery("")).toBeNull();
    expect(parseSizeSearchQuery(null)).toBeNull();
  });

  const items: InventoryFilterItem[] = [
    { id: 1, name: "سيراميك أبيض", code: "10001", currentStock: 10, reorderLevel: 2, itemType: "ceramic", sizeLengthCm: "30", sizeWidthCm: "60", tone: "101" },
    { id: 2, name: "سيراميك أبيض", code: "10002", currentStock: 5, reorderLevel: 2, itemType: "ceramic", sizeLengthCm: "40", sizeWidthCm: "40", tone: "202" },
    { id: 3, name: "رخام كريمي", code: "10003", currentStock: 7, reorderLevel: 2, itemType: "marble", sizeLengthCm: "130", sizeWidthCm: "20", thicknessCm: "3" },
    { id: 4, name: "صنف عادي", code: "10004", currentStock: 1, reorderLevel: 2 },
  ];

  it("يبحث بالتون", () => {
    expect(filterInventoryItems(items, "101", "all", "all", "code").map(item => item.code)).toEqual(["10001"]);
  });

  it("يبحث بالسُمك", () => {
    expect(filterInventoryItems(items, "سُمك 3", "all", "all", "code").map(item => item.code)).toEqual(["10003"]);
  });

  it("يبحث بالمقاس عبر الوصف المنسق", () => {
    expect(filterInventoryItems(items, "130×20", "all", "all", "code").map(item => item.code)).toEqual(["10003"]);
  });

  it("لا يخلط بين مواصفتين مختلفتين لنفس الاسم", () => {
    expect(filterInventoryItems(items, "202", "all", "all", "code").map(item => item.code)).toEqual(["10002"]);
  });

  it("يبقي الصنف العادي قابلًا للبحث باسمه", () => {
    expect(filterInventoryItems(items, "عادي", "all", "all", "code").map(item => item.code)).toEqual(["10004"]);
  });
});
