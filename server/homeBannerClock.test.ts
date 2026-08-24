import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatHomeBannerTime } from "../client/src/pages/Home";

describe("وقت البانر الرئيسي", () => {
  it("يعرض الوقت بالساعات والدقائق والثواني", () => {
    expect(formatHomeBannerTime(new Date("2026-08-22T13:05:07Z"), "en-US", "UTC")).toBe("01:05:07 PM");
    expect(formatHomeBannerTime(new Date("2026-08-22T13:05:07Z"), undefined, "UTC")).toBe("01:05:07 PM");
  });

  it("يحتوي على أنماط تباين مخصصة للوضعين النهاري والليلي", () => {
    const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(styles).toContain(".home-hero-time");
    expect(styles).toContain(".dark .home-hero-time");
    expect(styles).toContain("color: #ffffff !important");
    expect(styles).toContain(".home-hero-date");
  });

  it("يثبت اللون الأبيض مباشرة على نص تاريخ البانر", () => {
    const homePage = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(homePage).toContain('style={{ color: "#ffffff" }}');
  });
});
