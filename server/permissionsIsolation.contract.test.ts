import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessProject, chooseFallbackProject, parseAllowedProjectIds } from "./projectAccess";

/**
 * اختبارات تعاقدية + وحدات لعزل الصلاحيات (المرحلة 8).
 *
 * نغطي:
 *  1) منطق الوصول للمشروع (admin / مستخدم مسند / مستخدم غير مسند / مشروع مؤرشف).
 *  2) منع تجاوز اختيار المشروع عبر preferences.update (طلب API مباشر).
 *  3) تسجيل projectId في سجلات التدقيق لعمليات الإنشاء والإلغاء.
 *  4) بقاء صلاحيات الشاشات والتقارير والمخازن كما هي.
 */

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("projectAccess — canAccessProject", () => {
  const active = { id: 2, name: "مشروع ب", code: "B", status: "active" as const };
  const archived = { id: 3, name: "مشروع ج", code: "C", status: "archived" as const };

  it("admin can access any active project", () => {
    expect(canAccessProject({ role: "admin", allowedProjectIds: [], project: active })).toBe(true);
  });

  it("admin cannot access an archived project", () => {
    expect(canAccessProject({ role: "admin", allowedProjectIds: [], project: archived })).toBe(false);
  });

  it("user can access only assigned active projects", () => {
    expect(canAccessProject({ role: "user", allowedProjectIds: [2], project: active })).toBe(true);
    expect(canAccessProject({ role: "user", allowedProjectIds: [1], project: active })).toBe(false);
  });

  it("user with no assignments cannot access any project", () => {
    expect(canAccessProject({ role: "user", allowedProjectIds: [], project: active })).toBe(false);
  });

  it("missing project is never accessible", () => {
    expect(canAccessProject({ role: "admin", allowedProjectIds: [1], project: null })).toBe(false);
  });
});

describe("projectAccess — helpers", () => {
  it("parseAllowedProjectIds ignores invalid entries", () => {
    expect(parseAllowedProjectIds('["1",2,3.5,-4,0]')).toEqual([2]);
    expect(parseAllowedProjectIds(null)).toEqual([]);
    expect(parseAllowedProjectIds("not-json")).toEqual([]);
  });

  it("chooseFallbackProject keeps a valid active project, else falls back only when single", () => {
    const projects = [
      { id: 1, name: "أ", code: "A", status: "active" as const },
      { id: 2, name: "ب", code: "B", status: "active" as const },
    ];
    expect(chooseFallbackProject(projects, 2)?.id).toBe(2);
    expect(chooseFallbackProject(projects, 99)).toBeUndefined();
    expect(chooseFallbackProject([projects[0]], 99)?.id).toBe(1);
  });
});

describe("Phase 8 — permissions & administration contract", () => {
  const routersSource = read("server/routers.ts");
  const dbSource = read("server/db.ts");

  it("preferences.update validates the project before persisting it", () => {
    const start = routersSource.indexOf("  preferences: router({");
    expect(start).toBeGreaterThan(-1);
    const body = routersSource.slice(start, start + 1800);
    expect(body).toContain("setActiveProjectForUser({ userId: ctx.user.id, role: ctx.user.role, projectId: input.activeProjectId })");
    expect(body).toContain("upsertUserPreferences({ userId: ctx.user.id, ...input })");
  });

  it("setActiveProjectForUser rejects projects the user cannot access", () => {
    const start = dbSource.indexOf("export async function setActiveProjectForUser");
    expect(start).toBeGreaterThan(-1);
    const body = dbSource.slice(start, start + 900);
    expect(body).toContain("canAccessProject({ role: input.role, allowedProjectIds: access.allowedProjectIds, project })");
    expect(body).toContain("لا تملك صلاحية اختيار هذا المشروع");
  });

  it("permission updates reject archived or unknown projects", () => {
    const start = dbSource.indexOf("export async function upsertUserPermissionSettings");
    const body = dbSource.slice(start, start + 1600);
    expect(body).toContain('project.status === "active"');
    expect(body).toContain("لا يمكن إسناد المستخدم إلى مشروع مؤرشف أو غير موجود");
  });

  it("movement create audit logs record projectId", () => {
    for (const entity of ["addition", "disbursement", "transfer"]) {
      const pattern = new RegExp(`entity: "${entity}", entityId: result\\?\\.id, details: \\{[^}]*projectId: scope\\.projectId`);
      expect(routersSource).toMatch(pattern);
    }
  });

  it("movement cancel audit logs record projectId", () => {
    for (const entity of ["addition", "disbursement", "transfer"]) {
      const pattern = new RegExp(`action: "cancel_movement", entity: "${entity}", entityId: input\\.id, details: \\{ projectId: scope\\.projectId`);
      expect(routersSource).toMatch(pattern);
    }
  });

  it("screen, report and warehouse permissions are still enforced on write procedures", () => {
    expect(routersSource).toContain('writePermissionProcedure("additions")');
    expect(routersSource).toContain('writePermissionProcedure("disbursements")');
    expect(routersSource).toContain('writePermissionProcedure("transfers")');
    expect(routersSource).toContain("assertWarehouseAccess(ctx.permissions");
    expect(routersSource).toContain("assertWarehousesInProject(scope.projectId");
  });

  it("admin-only administration endpoints remain admin-gated", () => {
    expect(routersSource).toContain("listAll: adminProcedure");
    expect(routersSource).toContain("create: adminProcedure.input(z.object({ name:");
    expect(routersSource).toContain("update: adminProcedure.input(z.object({ id: z.number().int().positive(), name:");
    expect(routersSource).toContain("archive: adminProcedure");
    expect(routersSource).toContain("update: adminProcedure.input(z.object({ userId: z.number().int().positive()");
  });
});
