import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");

describe("استجابة الهاتف مع دوران الشاشة", () => {
  it("يدعم viewport الآمن والارتفاع الديناميكي", () => {
    expect(html).toContain('viewport-fit=cover');
    expect(css).toContain("100dvh");
    expect(css).toContain("env(safe-area-inset-bottom)");
  });

  it("يضبط الوضع الأفقي القصير دون قص المحتوى أو تداخل النوافذ", () => {
    expect(css).toContain("orientation: landscape");
    expect(css).toContain("max-height: 520px");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain(".quick-actions-mobile-launcher");
    expect(css).toContain("[data-radix-dialog-content]");
  });

  it("يحافظ على مساحة تنقل كافية في الوضع الرأسي", () => {
    expect(css).toContain("orientation: portrait");
    expect(css).toContain("padding-bottom: calc(6rem + env(safe-area-inset-bottom))");
  });
});
