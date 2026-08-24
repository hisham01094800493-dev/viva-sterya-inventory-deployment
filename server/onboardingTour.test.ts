import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ONBOARDING_TOUR_STEPS } from "../client/src/components/OnboardingTour";

describe("الجولة التعريفية للمستخدم الجديد", () => {
  it("تعرض شرحاً موجزاً للمخزون والتواصل والحماية والعمل دون إنترنت", () => {
    expect(ONBOARDING_TOUR_STEPS).toHaveLength(8);
    expect(ONBOARDING_TOUR_STEPS.map(step => step.title)).toEqual(["جولة سريعة قبل البدء", "القائمة والأصناف والمخازن", "مسؤوليات حسب الصلاحية", "المحادثات والإشعارات", "النسخ الاحتياطي والاستعادة", "العمل دون إنترنت", "الموبايل والكمبيوتر", "التقارير والتنبيهات"]);
    expect(ONBOARDING_TOUR_STEPS[2].description).toContain("للمستخدم المسؤول عنها فقط");
    expect(ONBOARDING_TOUR_STEPS[6].description).toContain("الموبايل أو الكمبيوتر");
  });

  it("تحفظ الإكمال لكل حساب وتتيح إعادة الجولة من الإعدادات", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const layoutSource = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    expect(routerSource).toContain("setOnboardingCompleted");
    expect(layoutSource).toContain("onboardingCompleted === false");
    expect(layoutSource).toContain("إعادة الجولة التعريفية");
  });
});
