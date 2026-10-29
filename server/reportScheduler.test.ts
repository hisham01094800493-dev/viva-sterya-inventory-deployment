import { describe, expect, it } from "vitest";
import { getCairoParts, isScheduleDue } from "./reportScheduler";

describe("جدولة التقرير اليومية بتوقيت القاهرة", () => {
  it("تستخدم Africa/Cairo حول بداية التوقيت الصيفي دون الاعتماد على UTC ثابت", () => {
    const before = getCairoParts(new Date("2026-04-24T20:59:00Z"));
    const after = getCairoParts(new Date("2026-04-24T21:00:00Z"));
    expect(before.date).toBe("2026-04-24");
    expect(after.date).toBe("2026-04-25");
    expect(isScheduleDue(new Date("2026-04-24T20:59:00Z"), "00:00", "2026-04-24")).toBe(false);
    expect(isScheduleDue(new Date("2026-04-24T21:00:00Z"), "00:00", "2026-04-24")).toBe(true);
  });

  it("يحسب موعد 17:00 بعد العودة للتوقيت الشتوي من خلال المنطقة الزمنية", () => {
    expect(getCairoParts(new Date("2026-10-30T14:00:00Z")).time).toBe("16:00");
    expect(getCairoParts(new Date("2026-10-30T15:00:00Z")).time).toBe("17:00");
    expect(isScheduleDue(new Date("2026-10-30T14:00:00Z"), "17:00", null)).toBe(false);
    expect(isScheduleDue(new Date("2026-10-30T15:00:00Z"), "17:00", null)).toBe(true);
  });

  it("ينفذ الموعد الفائت بعد إعادة التشغيل مرة واحدة فقط في نفس اليوم", () => {
    const now = new Date("2026-10-29T14:00:00Z");
    expect(isScheduleDue(now, "17:00", null)).toBe(true);
    expect(isScheduleDue(now, "17:00", "2026-10-28")).toBe(true);
    expect(isScheduleDue(now, "17:00", "2026-10-29")).toBe(false);
    expect(isScheduleDue(new Date("2026-10-29T13:59:00Z"), "17:00", null)).toBe(false);
  });
});
