import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("أزرار عمليات المخزون", () => {
  const movements = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("يربط لون زر العملية بنوع الحركة", () => {
    expect(movements).toContain('accent: "#0d806c"');
    expect(movements).toContain('accent: "#bd5147"');
    expect(movements).toContain('accent: "#a35e1b"');
    expect(movements).toContain('style={{ "--movement-accent": meta.accent }');
  });

  it("يبقي الإجراء أعلى الصفحة ويضمن تبايناً خاصاً بالوضع الداكن", () => {
    expect(styles).toContain(".dark .movement-page-new-button");
    expect(styles).toContain("background-color: var(--movement-accent");
    expect(styles).not.toContain("bottom: calc(1rem + env(safe-area-inset-bottom))");
    expect(styles).not.toMatch(/\.movement-page-new-button\s*\{[^}]*position:\s*fixed/s);
  });
});
