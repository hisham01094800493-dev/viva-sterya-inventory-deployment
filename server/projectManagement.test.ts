import { beforeEach, describe, expect, it, vi } from "vitest";

// قاعدة بيانات وهمية مُرتّبة: كل استدعاء select يستهلك النتيجة التالية من الطابور.
const state: { queue: any[]; inserts: any[]; updates: any[] } = { queue: [], inserts: [], updates: [] };

function fakeDb() {
  return {
    select() {
      const result = state.queue.shift() ?? [];
      const builder: any = {
        from: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => Promise.resolve(result),
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
    insert() {
      return {
        values: (values: any) => {
          state.inserts.push(values);
          const next = state.queue.shift();
          const settle = next && next.__error ? Promise.reject(next.__error) : Promise.resolve(next ?? { insertId: 1 });
          return {
            onDuplicateKeyUpdate: () => settle,
            then: (resolve: any, reject: any) => settle.then(resolve, reject),
          };
        },
      };
    },
    update() {
      return {
        set: (values: any) => ({
          where: () => {
            state.updates.push(values);
            return Promise.resolve();
          },
        }),
      };
    },
  };
}

vi.mock("./db/connection", () => ({
  requireDb: vi.fn(async () => fakeDb()),
  getDb: vi.fn(async () => fakeDb()),
  getPool: vi.fn(),
  checkDatabaseReadiness: vi.fn(),
  closeDatabasePool: vi.fn(),
}));

import {
  archiveProject,
  createProject,
  getActiveProjectForUser,
  listActiveProjectsForUser,
  setActiveProjectForUser,
  updateProject,
  upsertUserPermissionSettings,
} from "./db";
import { InventoryError } from "./db/errors";

function project(id: number, name: string, code: string, status: "active" | "archived" = "active") {
  return { id, name, code, description: null, status, createdAt: new Date(), updatedAt: new Date() };
}

beforeEach(() => {
  state.queue = [];
  state.inserts = [];
  state.updates = [];
});

describe("createProject", () => {
  it("يرفض اسم مشروع مكررًا (دون حساسية لحالة الأحرف)", async () => {
    state.queue = [[{ id: 1 }]];
    await expect(createProject({ name: "مشروع جديد", code: "NEW-1" })).rejects.toThrow("اسم المشروع مستخدم بالفعل");
    expect(state.inserts).toHaveLength(0);
  });

  it("يرفض كود مشروع مكررًا ويعيد رسالة عربية واضحة", async () => {
    state.queue = [[], { __error: new Error("Duplicate entry 'MAIN' for key 'projects_code_unique'") }];
    const error = await createProject({ name: "مشروع آخر", code: "MAIN" }).catch(value => value);
    expect(error).toBeInstanceOf(InventoryError);
    expect(error.kind).toBe("CONFLICT");
    expect(error.message).toBe("كود المشروع مستخدم بالفعل");
  });

  it("ينشئ المشروع ويطبّع الكود عند عدم وجود تكرار", async () => {
    state.queue = [[], { insertId: 7 }, [project(7, "مشروع جديد", "NEW-2")]];
    const created = await createProject({ name: "مشروع جديد", code: " new-2 " });
    expect(created?.code).toBe("NEW-2");
    expect(state.inserts[0]).toMatchObject({ name: "مشروع جديد", code: "NEW-2", status: "active" });
  });
});

describe("updateProject", () => {
  it("يرفض إعادة تسمية مشروع إلى اسم مشروع آخر", async () => {
    state.queue = [[project(1, "المشروع الأول", "P1")], [{ id: 2 }]];
    await expect(updateProject({ id: 1, name: "المشروع الثاني" })).rejects.toThrow("اسم المشروع مستخدم بالفعل");
  });

  it("يسمح بالإبقاء على نفس الاسم دون استعلام تكرار", async () => {
    state.queue = [[project(1, "المشروع الأول", "P1")], [project(1, "المشروع الأول", "P1")]];
    const updated = await updateProject({ id: 1, name: "المشروع الأول", description: "وصف" });
    expect(updated?.id).toBe(1);
    expect(state.updates[0]).toMatchObject({ name: "المشروع الأول", description: "وصف" });
  });
});

describe("archiveProject", () => {
  it("يمنع أرشفة المشروع الافتراضي MAIN", async () => {
    state.queue = [[project(1, "مشروع جديد", "MAIN")]];
    await expect(archiveProject(1)).rejects.toThrow("لا يمكن أرشفة المشروع الافتراضي MAIN");
  });

  it("يرفض أرشفة مشروع غير موجود", async () => {
    state.queue = [[]];
    await expect(archiveProject(99)).rejects.toThrow("المشروع غير موجود");
  });
});

describe("project visibility", () => {
  it("المدير يرى كل المشاريع النشطة", async () => {
    state.queue = [[project(1, "أ", "A"), project(2, "ب", "B")]];
    const visible = await listActiveProjectsForUser(1, "admin");
    expect(visible.map(item => item.id)).toEqual([1, 2]);
  });

  it("المستخدم العادي لا يرى إلا المشاريع المسندة إليه", async () => {
    state.queue = [[project(1, "أ", "A"), project(2, "ب", "B")], [{ allowedProjects: "[2]" }]];
    const visible = await listActiveProjectsForUser(5, "user");
    expect(visible.map(item => item.id)).toEqual([2]);
  });

  it("يمنح المستخدم مشروعه الوحيد تلقائيًا عند عدم وجود تفضيل محفوظ", async () => {
    state.queue = [
      [project(3, "ج", "C")],
      [{ allowedProjects: "[3]" }],
      [{ activeProjectId: null }],
    ];
    const active = await getActiveProjectForUser(5, "user");
    expect(active?.id).toBe(3);
  });

  it("يعيد التفضيل المحفوظ عندما يكون متاحًا", async () => {
    state.queue = [
      [project(3, "ج", "C"), project(4, "د", "D")],
      [{ allowedProjects: "[3,4]" }],
      [{ activeProjectId: 4 }],
    ];
    const active = await getActiveProjectForUser(5, "user");
    expect(active?.id).toBe(4);
  });
});

describe("setActiveProjectForUser", () => {
  it("يرفض اختيار مشروع مؤرشف كمشروع نشط", async () => {
    state.queue = [[project(2, "ب", "B", "archived")], [{ allowedProjects: "[2]" }]];
    await expect(setActiveProjectForUser({ userId: 5, role: "user", projectId: 2 })).rejects.toThrow(
      "لا تملك صلاحية اختيار هذا المشروع",
    );
  });

  it("يرفض اختيار مشروع غير مسند للمستخدم", async () => {
    state.queue = [[project(2, "ب", "B")], [{ allowedProjects: "[1]" }]];
    await expect(setActiveProjectForUser({ userId: 5, role: "user", projectId: 2 })).rejects.toThrow(
      "لا تملك صلاحية اختيار هذا المشروع",
    );
  });
});

describe("upsertUserPermissionSettings", () => {
  const base = {
    userId: 5,
    allowedScreens: ["dashboard"],
    allowedReports: ["inventory-summary"],
    allowedWarehouseIds: [],
    readOnly: false,
  };

  it("يرفض إسناد مستخدم إلى مشروع مؤرشف أو غير موجود", async () => {
    state.queue = [[{ id: 2, status: "archived" }]];
    await expect(upsertUserPermissionSettings({ ...base, allowedProjectIds: [2] })).rejects.toThrow(
      "لا يمكن إسناد المستخدم إلى مشروع مؤرشف أو غير موجود",
    );
    expect(state.inserts).toHaveLength(0);
  });

  it("يقبل إسناد المستخدم إلى مشاريع نشطة فقط", async () => {
    state.queue = [[{ id: 1, status: "active" }], [{ allowedProjects: "[1]" }]];
    await upsertUserPermissionSettings({ ...base, allowedProjectIds: [1] });
    expect(state.inserts[0]).toMatchObject({ allowedProjects: "[1]" });
  });
});
