import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("تدوير صورة الإذن في المعاينة", () => {
  it("يدور الصورة داخل المعاينة فقط ويعيد ضبطها دون تعديل الملف", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
    expect(source).toContain("const [previewRotation, setPreviewRotation] = useState(0)");
    expect(source).toContain("function rotatePreviewImage() { setPreviewRotation(current => (current + 90) % 360)");
    expect(source).toContain('setAttribute("aria-label", "تدوير الصورة 90 درجة")');
    expect(source).toContain("rotate(${previewRotation}deg)");
    expect(source).toContain("image.style.transform");
  });

  it("يوفر ملء الشاشة والخروج منه مع استمرار أدوات المعاينة", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
    expect(source).toContain("const [previewFullscreen, setPreviewFullscreen] = useState(false)");
    expect(source).toContain("function togglePreviewFullscreen()");
    expect(source).toContain("requestFullscreen");
    expect(source).toContain("الخروج من ملء الشاشة");
    expect(source).toContain("عرض الصورة في ملء الشاشة");
  });
});
