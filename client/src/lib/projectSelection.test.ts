import { describe, expect, it } from "vitest";
import {
  isOperationalPath,
  projectLabel,
  projectOptionLabel,
  projectStatusLabel,
  resolveActiveProject,
  selectableProjects,
  shouldBlockOperationalScreen,
  type ProjectOption,
} from "./projectSelection";

const main: ProjectOption = { id: 1, name: "مشروع جديد", code: "MAIN", status: "active" };
const second: ProjectOption = { id: 7, name: "مشروع المعادي", code: "PROJECT-2", status: "active" };
const archived: ProjectOption = { id: 9, name: "مشروع قديم", code: "OLD", status: "archived" };

describe("selectableProjects", () => {
  it("يستبعد المشاريع المؤرشفة", () => {
    expect(selectableProjects([main, archived, second]).map(project => project.id)).toEqual([1, 7]);
  });

  it("يتعامل مع القيم الفارغة", () => {
    expect(selectableProjects(null)).toEqual([]);
    expect(selectableProjects(undefined)).toEqual([]);
  });
});

describe("resolveActiveProject", () => {
  it("يختار المشروع الوحيد تلقائيًا ويطلب حفظه", () => {
    const resolved = resolveActiveProject([main], null);
    expect(resolved.project?.id).toBe(1);
    expect(resolved.needsExplicitSelection).toBe(false);
    expect(resolved.autoSelectId).toBe(1);
  });

  it("لا يختار تلقائيًا عند وجود أكثر من مشروع بدون تفضيل محفوظ", () => {
    const resolved = resolveActiveProject([main, second], null);
    expect(resolved.project).toBeNull();
    expect(resolved.needsExplicitSelection).toBe(true);
    expect(resolved.autoSelectId).toBeNull();
  });

  it("يحترم المشروع المحفوظ إذا كان مسموحًا", () => {
    const resolved = resolveActiveProject([main, second], 7);
    expect(resolved.project?.id).toBe(7);
    expect(resolved.needsExplicitSelection).toBe(false);
    expect(resolved.autoSelectId).toBeNull();
  });

  it("يتجاهل مشروعًا محفوظًا غير مسموح به أو مؤرشفًا", () => {
    expect(resolveActiveProject([main, second], 9).project).toBeNull();
    expect(resolveActiveProject([main, second], 9).needsExplicitSelection).toBe(true);
    expect(resolveActiveProject([main], 42).project?.id).toBe(1);
  });

  it("لا يعيد مشروعًا مؤرشفًا حتى لو كان المحفوظ", () => {
    const resolved = resolveActiveProject([main, archived], 9);
    expect(resolved.project?.id).toBe(1);
    expect(resolved.autoSelectId).toBe(1);
  });

  it("يعيد حالة فارغة عند عدم وجود مشاريع مسموحة", () => {
    const resolved = resolveActiveProject([archived], null);
    expect(resolved).toEqual({ project: null, needsExplicitSelection: false, autoSelectId: null });
  });
});

describe("isOperationalPath", () => {
  it("يعتبر الصفحة الرئيسية تشغيلية", () => {
    expect(isOperationalPath("/")).toBe(true);
    expect(isOperationalPath("/overview")).toBe(true);
  });

  it("يتعرف على الشاشات التشغيلية وفروعها", () => {
    expect(isOperationalPath("/items")).toBe(true);
    expect(isOperationalPath("/items/123")).toBe(true);
    expect(isOperationalPath("/warehouses/2?tab=stock")).toBe(true);
    expect(isOperationalPath("/reports")).toBe(true);
    expect(isOperationalPath("/project-work-center")).toBe(true);
  });

  it("لا يعتبر شاشات الإدارة تشغيلية", () => {
    expect(isOperationalPath("/settings")).toBe(false);
    expect(isOperationalPath("/governance")).toBe(false);
    expect(isOperationalPath("/migration-import")).toBe(false);
    expect(isOperationalPath("/chat")).toBe(false);
  });

  it("يتعامل مع القيم الفارغة", () => {
    expect(isOperationalPath(null)).toBe(false);
    expect(isOperationalPath(undefined)).toBe(false);
    expect(isOperationalPath("")).toBe(false);
  });
});

describe("shouldBlockOperationalScreen", () => {
  it("لا يحجب شيئًا عندما يكون نظام المشاريع غير متاح", () => {
    expect(
      shouldBlockOperationalScreen({
        path: "/items",
        projectsAvailable: false,
        resolved: { project: null, needsExplicitSelection: false, autoSelectId: null },
      }),
    ).toBe(false);
  });

  it("يحجب الشاشة التشغيلية عند غياب مشروع نشط", () => {
    expect(
      shouldBlockOperationalScreen({
        path: "/items",
        projectsAvailable: true,
        resolved: { project: null, needsExplicitSelection: true, autoSelectId: null },
      }),
    ).toBe(true);
  });

  it("لا يحجب عند وجود مشروع نشط", () => {
    expect(
      shouldBlockOperationalScreen({
        path: "/items",
        projectsAvailable: true,
        resolved: { project: main, needsExplicitSelection: false, autoSelectId: null },
      }),
    ).toBe(false);
  });

  it("لا يحجب شاشات الإدارة حتى بدون مشروع", () => {
    expect(
      shouldBlockOperationalScreen({
        path: "/settings",
        projectsAvailable: true,
        resolved: { project: null, needsExplicitSelection: true, autoSelectId: null },
      }),
    ).toBe(false);
  });
});

describe("تسميات المشروع", () => {
  it("يستخدم الاسم ثم الكود كبديل", () => {
    expect(projectLabel(main)).toBe("مشروع جديد");
    expect(projectLabel({ name: "   ", code: "MAIN" })).toBe("MAIN");
  });

  it("يضيف الكود إلى تسمية القائمة", () => {
    expect(projectOptionLabel(second)).toBe("مشروع المعادي · PROJECT-2");
  });

  it("يعبّر عن الحالة في الشريط العلوي", () => {
    expect(projectStatusLabel({ project: main, needsExplicitSelection: false, autoSelectId: null })).toBe("مشروع جديد");
    expect(projectStatusLabel({ project: null, needsExplicitSelection: true, autoSelectId: null })).toBe("اختر مشروعًا");
    expect(projectStatusLabel({ project: null, needsExplicitSelection: false, autoSelectId: null })).toBe("لا يوجد مشروع مخصص");
  });
});
