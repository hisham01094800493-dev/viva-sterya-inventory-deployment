import { describe, expect, it } from "vitest";
import {
  formatItemDisplayName,
  formatItemSpecLabel,
  ItemSpecError,
  normalizeItemSpec,
} from "@shared/itemSpec";

describe("normalizeItemSpec", () => {
  it("keeps general items simple with empty spec fields", () => {
    expect(normalizeItemSpec({ itemType: "general" })).toEqual({
      itemType: "general",
      sizeLengthCm: null,
      sizeWidthCm: null,
      tone: null,
      thicknessCm: null,
      specGroupKey: null,
    });
    expect(normalizeItemSpec({})).toMatchObject({ itemType: "general" });
  });

  it("rejects spec fields on general items", () => {
    expect(() =>
      normalizeItemSpec({ itemType: "general", sizeLengthCm: 30 })
    ).toThrow(ItemSpecError);
    expect(() => normalizeItemSpec({ tone: "101" })).toThrow(ItemSpecError);
  });

  it("accepts ceramic size and tone and normalizes decimals", () => {
    expect(
      normalizeItemSpec({
        itemType: "ceramic",
        sizeLengthCm: 30,
        sizeWidthCm: "60",
        tone: " 101 ",
      })
    ).toEqual({
      itemType: "ceramic",
      sizeLengthCm: "30.00",
      sizeWidthCm: "60.00",
      tone: "101",
      thicknessCm: null,
      specGroupKey: null,
    });
  });

  it("rejects marble thickness on ceramic items", () => {
    expect(() =>
      normalizeItemSpec({
        itemType: "ceramic",
        sizeLengthCm: 30,
        sizeWidthCm: 60,
        thicknessCm: 2,
      })
    ).toThrow(/السمك خاص بالرخام/);
  });

  it("accepts marble size and thickness", () => {
    expect(
      normalizeItemSpec({
        itemType: "marble",
        sizeLengthCm: 130,
        sizeWidthCm: 20,
        thicknessCm: 2,
      })
    ).toEqual({
      itemType: "marble",
      sizeLengthCm: "130.00",
      sizeWidthCm: "20.00",
      tone: null,
      thicknessCm: "2.00",
      specGroupKey: null,
    });
  });

  it("rejects ceramic tone on marble items", () => {
    expect(() =>
      normalizeItemSpec({
        itemType: "marble",
        sizeLengthCm: 130,
        sizeWidthCm: 20,
        tone: "101",
      })
    ).toThrow(/التون خاص بالسيراميك/);
  });

  it("requires both length and width", () => {
    expect(() =>
      normalizeItemSpec({ itemType: "ceramic", sizeLengthCm: 30 })
    ).toThrow(/الطول والعرض/);
    expect(() =>
      normalizeItemSpec({ itemType: "marble", sizeWidthCm: 20 })
    ).toThrow(/الطول والعرض/);
  });

  it("rejects non-positive dimensions", () => {
    expect(() =>
      normalizeItemSpec({
        itemType: "ceramic",
        sizeLengthCm: 0,
        sizeWidthCm: 60,
      })
    ).toThrow(/أكبر من صفر/);
  });
});

describe("formatItemSpecLabel", () => {
  it("returns null for general and legacy items", () => {
    expect(formatItemSpecLabel({ itemType: "general" })).toBeNull();
    expect(formatItemSpecLabel({ itemType: null })).toBeNull();
    expect(formatItemSpecLabel(null)).toBeNull();
  });

  it("formats ceramic size and tone", () => {
    expect(
      formatItemSpecLabel({
        itemType: "ceramic",
        sizeLengthCm: "30.00",
        sizeWidthCm: "60.00",
        tone: "101",
      })
    ).toBe("30×60 سم — تون 101");
  });

  it("formats marble size and thickness", () => {
    expect(
      formatItemSpecLabel({
        itemType: "marble",
        sizeLengthCm: "130.00",
        sizeWidthCm: "20.00",
        thicknessCm: "2.00",
      })
    ).toBe("130×20 سم — سُمك 2 سم");
  });

  it("builds the full display name", () => {
    expect(
      formatItemDisplayName("سيراميك أبيض", {
        itemType: "ceramic",
        sizeLengthCm: "30.00",
        sizeWidthCm: "60.00",
        tone: "101",
      })
    ).toBe("سيراميك أبيض — 30×60 سم — تون 101");
    expect(formatItemDisplayName("أسمنت", { itemType: "general" })).toBe(
      "أسمنت"
    );
  });
});
