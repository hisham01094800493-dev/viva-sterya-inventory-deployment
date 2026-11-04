import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/WarehousesSuppliersPages.tsx"),
  "utf8"
);

describe("واجهة فتح مخزن جديد داخل المشروع", () => {
  it("تعرض زر «فتح مخزن جديد» للمدير/المدير العام فقط", () => {
    expect(source).toContain("فتح مخزن جديد");
    expect(source).toContain('me.data?.role === "admin"');
    expect(source).toContain('me.data?.role === "manager"');
    expect(source).toContain("canCreateWarehouse");
  });

  it("تخفي الزر عند غياب مشروع نشط أو عدم توفر طبقة المشاريع", () => {
    expect(source).toContain("Boolean(activeProject)");
    expect(source).toContain("activeProjectState.projectsAvailable");
  });

  it("تعرض اسم المشروع النشط داخل نافذة الإنشاء", () => {
    expect(source).toContain("المشروع النشط:");
    expect(source).toContain("projectLabel(activeProject)");
  });

  it("تجعل اسم المخزن مطلوبًا بحد أقصى 128 حرفًا", () => {
    expect(source).toContain('htmlFor="new-warehouse-name"');
    expect(source).toContain("maxLength={128}");
    expect(source).toContain("اسم المخزن مطلوب");
  });

  it("تجعل رقم المخزن اختياريًا وتوضح أن الخادم يختار الرقم التالي", () => {
    expect(source).toContain("رقم المخزن (اختياري)");
    expect(source).toContain("اتركه فارغًا ليختار الخادم الرقم التالي المتاح");
  });

  it("تستخدم رسالة تأكيد تتضمن اسم المخزن والمشروع والرقم", () => {
    expect(source).toContain("تم فتح مخزن «");
    expect(source).toContain("داخل مشروع «");
    expect(source).toContain("برقم «");
  });

  it("تحدّث قائمة المخازن بعد الإنشاء", () => {
    expect(source).toContain("utils.warehouses.list.invalidate()");
  });

  it("تعطّل زر الحفظ أثناء الطلب وتعرض أخطاء الخادم بالعربية", () => {
    expect(source).toContain("createWarehouse.isPending");
    expect(source).toContain("جارٍ الإنشاء...");
    expect(source).toContain('role="alert"');
    expect(source).toContain("createError");
  });

  it("لا تسمح باختيار المشروع من قائمة في هذه النسخة", () => {
    // لا يوجد منتقي مشروع داخل نافذة الإنشاء؛ المشروع يأتي من النطاق النشط.
    expect(source).not.toContain("new-warehouse-project");
  });
});
