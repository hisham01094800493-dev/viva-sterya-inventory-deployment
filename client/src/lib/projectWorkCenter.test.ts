import { describe, expect, it } from "vitest";
import { cairoDateKey, formatCairoDateLabel, parseProjectWorkCenterLocation } from "./projectWorkCenter";

describe("project work-center date helpers", () => {
  it("uses Cairo's calendar date rather than the browser's UTC date", () => {
    expect(cairoDateKey(new Date("2026-11-03T22:30:00.000Z"))).toBe("2026-11-04");
    expect(cairoDateKey(new Date("2026-11-04T01:30:00.000Z"))).toBe("2026-11-04");
  });

  it("formats the selected date without timezone conversion", () => {
    expect(formatCairoDateLabel("2026-11-04")).toBe("04/11/2026");
    expect(formatCairoDateLabel("invalid")).toBe("—");
  });

  it("reads the daily report date and project from a notification link", () => {
    expect(parseProjectWorkCenterLocation("/project-work-center?date=2026-11-05&projectId=7"))
      .toEqual({ date: "2026-11-05", projectId: 7 });
  });

  it("ignores invalid dates and project IDs in the URL", () => {
    expect(parseProjectWorkCenterLocation("/project-work-center?date=2026-02-30&projectId=-3"))
      .toEqual({ date: null, projectId: null });
  });
});
