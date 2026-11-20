import { describe, expect, it } from "vitest";
import { collectMeasurementUnits, findMeasurementUnit, normalizeMeasurementUnit } from "./measurementUnits";

describe("measurement units", () => {
  it("normalizes common square-meter variants", () => {
    expect(normalizeMeasurementUnit("م2")).toBe("م²");
    expect(normalizeMeasurementUnit("متر مربع")).toBe("م²");
  });

  it("returns unique unit suggestions without mixing aliases", () => {
    expect(collectMeasurementUnits([{ unit: "م2" }, { unit: "م²" }, { unit: "عدد" }, { unit: "" }])).toEqual(["عدد", "م²"]);
  });

  it("resolves a selected unit to the canonical catalog value", () => {
    expect(findMeasurementUnit([{ unit: "م2" }], "م²")).toBe("م2");
    expect(findMeasurementUnit([{ unit: "عدد" }], "عدد")).toBe("عدد");
  });
});
