import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/DraftsPage.tsx"),
  "utf8"
);
const helpers = readFileSync(
  resolve(process.cwd(), "client/src/lib/localDrafts.ts"),
  "utf8"
);

describe("الكتابة بالقلم ومرفقات الملاحظات", () => {
  it("يفتح صفحة بيضاء كاملة الشاشة تدعم قلم الشاشة واللمس", () => {
    expect(source).toContain("<Dialog open={open} onOpenChange={setOpen}>");
    expect(source).toMatch(/position:\s*"fixed",\s*inset:\s*0/);
    expect(source).toContain('height: "100dvh"');
    expect(source).toContain("right: 0");
    expect(source).toContain("minWidth: 0");
    expect(source).toContain('aspectRatio: "2 / 3"');
    expect(source).toContain("items-center justify-center overflow-hidden");
    expect(source).toContain(
      'aria-label="صفحة بيضاء كبيرة للكتابة بالقلم أو الرسم"'
    );
    expect(source).toContain("touch-none select-none");
    expect(source).toContain("onPointerDown={startDrawing}");
    expect(source).toContain("onPointerMove={continueDrawing}");
    expect(source).toContain("const [penColor, setPenColor]");
    expect(source).toContain("اختيار لون");
    expect(source).toContain("aria-pressed={penColor === color.value}");
    expect(source).toContain("حفظ الكتابة والعودة");
    expect(source).toContain("مسح الصفحة");
  });

  it("يحفظ الكتابة بالقلم والصور مع الملاحظة ويحمّل المسودات القديمة", () => {
    expect(helpers).toMatch(
      /handwriting:\s*string;\s*image:\s*string;\s*imageName:\s*string/
    );
    expect(helpers).toContain('handwriting: ""');
    expect(helpers).toContain('image: ""');
    expect(source).toContain("writeLocalDrafts(storageKey, normalized)");
    expect(helpers).toContain("setItem(key, JSON.stringify(drafts))");
    expect(source).toContain("function createDraftId()");
    expect(helpers).toContain("id: String(draft.id)");
    expect(helpers).toContain("createdAt: draft.createdAt ?? now");
    expect(source).toContain("ملاحظة مكتوبة بالقلم");
  });

  it("يفتح المسودة المختارة في المحرر مباشرةً ويحفظ التعديل على نفس المسودة", () => {
    expect(source).toContain("function startNewDraft()");
    expect(source).toContain("onClick={() => selectDraft(draft)}");
    expect(source).toContain("const id = editingId ?? createDraftId();");
    expect(source).toContain("editingId: id,");
    expect(helpers).toContain("id: input.editingId ?? input.newId");
    expect(helpers).toContain("item.id === draft.id");
    expect(source).toContain('className="order-1 border-0');
    expect(source).toContain('className="order-2 border-0');
    expect(source).toContain("editorCardRef.current?.scrollIntoView(");
  });

  it("يبقي المعاينة كخيار منفصل ويمنع قفزة التركيز عند الانتقال للتحرير", () => {
    expect(source).toContain("onClick={() => setPreviewDraft(draft)}");
    expect(source).toContain("aria-label={`معاينة ${draft.title}`}");
    expect(source).toContain("aria-label={`تحرير ${draft.title}`}");
    expect(source).toContain("preventPreviewFocusRestoreRef.current = true");
    expect(source).toContain("onCloseAutoFocus={event => {");
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("setPreviewDraft(null);");
    expect(source).toContain("تعديل الملاحظة");
    expect(source).toContain("تصدير PDF");
    expect(source).toContain("تصدير صورة");
    expect(source).toContain("exportDraftPdf");
    expect(source).toContain("exportDraftImage");
  });

  it("يسمح باختيار صورة من الهاتف ويضغطها قبل حفظها محليًا", () => {
    expect(source).toMatch(/accept="image\/\*"\s+capture="environment"/);
    expect(source).toContain("compressImageFile(file, {");
    expect(source).toContain("maxDimension: 1200");
    expect(source).toContain("quality: 0.72");
    expect(source).toContain("compressed.dataBase64.length > 1_250_000");
    expect(source).toContain("إزالة الصورة");
    expect(source).toContain("تغيير الصورة");
  });

  it("يسمح بحفظ الملاحظة التي تتكون من كتابة بالقلم أو صورة دون نص مكتوب", () => {
    expect(source).toContain("(!body && !form.handwriting && !form.image)");
    expect(source).toContain(
      "اكتب عنوان الملاحظة وأضف نصًا أو كتابة بالقلم أو صورة"
    );
  });
});
