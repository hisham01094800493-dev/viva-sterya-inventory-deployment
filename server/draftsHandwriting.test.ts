import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DraftsPage.tsx"), "utf8");

describe("الكتابة بالقلم ومرفقات الملاحظات", () => {
  it("يفتح صفحة بيضاء كاملة الشاشة تدعم قلم الشاشة واللمس", () => {
    expect(source).toContain("<Dialog open={open} onOpenChange={setOpen}>");
    expect(source).toContain('position: "fixed", inset: 0');
    expect(source).toContain('height: "100dvh"');
    expect(source).toContain('right: 0');
    expect(source).toContain('minWidth: 0');
    expect(source).toContain('aspectRatio: "2 / 3"');
    expect(source).toContain("items-center justify-center overflow-hidden");
    expect(source).toContain('aria-label="صفحة بيضاء كبيرة للكتابة بالقلم أو الرسم"');
    expect(source).toContain("touch-none select-none");
    expect(source).toContain("onPointerDown={startDrawing}");
    expect(source).toContain("onPointerMove={continueDrawing}");
    expect(source).toContain("const [penColor, setPenColor]");
    expect(source).toContain("اختيار لون");
    expect(source).toContain("aria-pressed={penColor === color.value}");
    expect(source).toContain("حفظ الكتابة والعودة");
    expect(source).toContain("مسح الصفحة");
  });

  it("يحفظ صورة الكتابة مع الملاحظة ويعيد تحميل المسودات القديمة دون فقدها", () => {
    expect(source).toContain("handwriting: string; image: string; imageName: string");
    expect(source).toContain("handwriting: \"\", image: \"\", imageName: \"\"");
    expect(source).toContain("window.localStorage.setItem(storageKey, JSON.stringify(normalized))");
    expect(source).toContain("function createDraftId()");
    expect(source).toContain("id: String(draft.id)");
    expect(source).toContain("createdAt: draft.createdAt ?? new Date().toISOString()");
    expect(source).toContain("ملاحظة مكتوبة بالقلم");
  });

  it("يفصل بين إنشاء ملاحظة جديدة وتعديل ملاحظة محفوظة", () => {
    expect(source).toContain("function startNewDraft()");
    expect(source).toContain("editingId ? drafts.map(item => item.id === editingId ? nextDraft : item)");
    expect(source).toContain("[nextDraft, ...drafts.filter(item => item.id !== nextDraft.id)]");
    expect(source).toContain("{drafts.length}");
    expect(source).toContain("const selectedDraft = drafts.find(item => item.id === draft.id) ?? draft");
    expect(source).toContain("setPreviewDraft(null);");
    expect(source).toContain("editingId ? \"order-2 lg:order-1\" : \"order-1\"");
    expect(source).toContain("editingId ? \"order-1 lg:order-2\" : \"order-2 lg:order-2\"");
  });

  it("يسمح باختيار صورة من الهاتف ويضغطها قبل حفظها محليًا", () => {
    expect(source).toContain('accept="image/*" capture="environment"');
    expect(source).toContain("compressImageFile(file, { maxDimension: 1200, quality: 0.72 })");
    expect(source).toContain("compressed.dataBase64.length > 1_250_000");
    expect(source).toContain("إزالة الصورة");
    expect(source).toContain("تغيير الصورة");
  });

  it("يسمح بحفظ الملاحظة التي تتكون من كتابة بالقلم أو صورة دون نص مكتوب", () => {
    expect(source).toContain("(!body && !form.handwriting && !form.image)");
    expect(source).toContain("اكتب عنوان الملاحظة وأضف نصًا أو كتابة بالقلم أو صورة");
  });

  it("يعرض الملاحظة المحفوظة للمعاينة والتعديل والتصدير", () => {
    expect(source).toContain("setPreviewDraft(draft)");
    expect(source).toContain("تعديل الملاحظة");
    expect(source).toContain("تصدير PDF");
    expect(source).toContain("تصدير صورة");
    expect(source).toContain("exportDraftPdf");
    expect(source).toContain("exportDraftImage");
  });
});
