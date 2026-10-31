import { describe, expect, it } from "vitest";
import { computeNextRunAt, getCairoParts, isScheduleDue } from "./reportScheduler";

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

  it("يحسب التشغيل القادم 17:00 بتوقيت القاهرة في التوقيت الشتوي", () => {
    // 2026-10-30 16:00 القاهرة = 14:00 UTC، والموعد القادم 17:00 القاهرة = 15:00 UTC
    expect(computeNextRunAt(new Date("2026-10-30T14:00:00Z"), "17:00")).toBe("2026-10-30T15:00:00.000Z");
    // بعد الموعد ينتقل لليوم التالي
    expect(computeNextRunAt(new Date("2026-10-30T15:05:00Z"), "17:00")).toBe("2026-10-31T15:00:00.000Z");
  });

  it("يحسب التشغيل القادم 17:00 بتوقيت القاهرة في التوقيت الصيفي", () => {
    // 2026-04-24 القاهرة = UTC+3، لذا 17:00 القاهرة = 14:00 UTC
    expect(computeNextRunAt(new Date("2026-04-24T10:00:00Z"), "17:00")).toBe("2026-04-24T14:00:00.000Z");
  });

  it("يتعامل صح مع اختلاف تاريخ القاهرة عن تاريخ UTC بعد منتصف الليل", () => {
    // 2026-10-31 23:06 UTC = 2026-11-01 01:06 القاهرة (UTC+2)
    // الموعد القادم يجب أن يكون 1 نوفمبر 17:00 القاهرة = 2026-11-01T15:00:00Z
    expect(computeNextRunAt(new Date("2026-10-31T23:06:00Z"), "17:00")).toBe("2026-11-01T15:00:00.000Z");
    // ولا يكون في الماضي أبدًا
    const next = new Date(computeNextRunAt(new Date("2026-10-31T23:06:00Z"), "17:00"));
    expect(next.getTime()).toBeGreaterThan(new Date("2026-10-31T23:06:00Z").getTime());
  });

  it("يتعامل صح مع منتصف الليل بالضبط (00:30 القاهرة)", () => {
    // 2026-10-31 22:30 UTC = 2026-11-01 00:30 القاهرة
    expect(computeNextRunAt(new Date("2026-10-31T22:30:00Z"), "17:00")).toBe("2026-11-01T15:00:00.000Z");
  });
});
