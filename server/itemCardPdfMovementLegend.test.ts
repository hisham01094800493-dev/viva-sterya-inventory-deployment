import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("وسوم الحركة في PDF كارت الصنف", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/lib/inventoryExportFiles.ts"), "utf8");
  const start = source.indexOf("export async function buildItemCardPdf(");
  const end = source.indexOf("export async function downloadItemCardPdf(", start);
  const itemCardPdf = source.slice(start, end);

  it("لا يرسم وسومًا تفسيرية فوق الجدول ويحافظ على عمود نوع الحركة داخله", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(itemCardPdf).not.toContain("const legend =");
    expect(itemCardPdf).not.toContain("legend.forEach");
    expect(itemCardPdf).toContain('movement: "الحركة"');
    expect(itemCardPdf).toContain("lastAutoTable.finalY + 24");
  });
});
