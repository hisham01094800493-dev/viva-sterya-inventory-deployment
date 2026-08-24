import { describe, expect, it } from "vitest";
import { clampQuickActionsPosition, snapQuickActionsToNearestEdge } from "../client/src/components/DashboardLayout";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("قائمة الإجراءات السريعة العائمة", () => {
  it("يعيد موضع الزر العائم إلى داخل الشاشة عند تصغيرها أو تدويرها", () => {
    expect(clampQuickActionsPosition({ x: 1600, y: 1100 }, { width: 390, height: 844 })).toEqual({ x: 326, y: 780 });
    expect(clampQuickActionsPosition({ x: -40, y: -12 }, { width: 1280, height: 720 })).toEqual({ x: 8, y: 8 });
  });

  it("يعود إلى أسفل الشاشة ويلتصق بالحافة الأفقية الأقرب بعد السحب", () => {
    expect(snapQuickActionsToNearestEdge({ x: 42, y: 220 }, { width: 390, height: 844 })).toEqual({ x: 8, y: 780, edge: "left" });
    expect(snapQuickActionsToNearestEdge({ x: 280, y: 220 }, { width: 390, height: 844 })).toEqual({ x: 326, y: 780, edge: "right" });
  });

  it("يعرض نصف دائرة ملتصقة بالحافة على الهاتف فقط عند طي الزر", () => {
    const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(styles).toContain("quick-actions-mobile-docked-left");
    expect(styles).toContain("quick-actions-mobile-docked-right");
    expect(styles).toContain("translateX(-24px)");
    expect(styles).toContain("translateX(24px)");
  });

  it("يربط السحب بزر الموجب نفسه حتى لا يمنع نقر فتح القائمة بالماوس", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    expect(source).toContain("onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}");
    expect(source).toContain("onClick={() => { if (suppressClickRef.current) return; const opening = !open;");
  });

  it("يحفظ موضع سطح المكتب دائماً باستخدام حجم الزر المطوي الظاهر", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    expect(source).toContain("height: window.innerHeight }, 48)");
    expect(source).toContain("position ? { left: `${position.x}px`, top: `${position.y}px` }");
  });

  it("يطبق انتقال استقرار بعد الإفلات ويحترم تقليل الحركة", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(source).toContain("quick-actions-settling");
    expect(styles).toContain("cubic-bezier(0.23, 1, 0.32, 1)");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("يبقي الأيقونة فوق القائمة السفلية وبشفافية كاملة عند الطي", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    expect(source).toContain("fixed z-[55]");
    expect(source).toContain("${mobileDockClass} ${compactMode ? \"w-12\" : \"w-auto\"} opacity-100");
    expect(source).not.toContain('compactMode ? "opacity-50 hover:opacity-100"');
  });

  it("يحصر الحاوية في عرض الأيقونة عند الإغلاق حتى تعود للحافة ولا تختفي", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    expect(source).toContain('${compactMode ? "w-12" : "w-auto"} opacity-100');
    expect(source).toContain('transition-[left,top,transform,opacity]');
  });
});
