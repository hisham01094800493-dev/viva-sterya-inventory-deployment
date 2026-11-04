import { beforeEach, describe, expect, it, vi } from "vitest";

// قاعدة بيانات وهمية مُرتّبة: كل استدعاء select/insert يستهلك النتيجة التالية من
// الطابور، دون أي اتصال بقاعدة بيانات حقيقية.
const state: { queue: any[]; inserts: any[] } = { queue: [], inserts: [] };

function fakeDb() {
  return {
    select() {
      const result = state.queue.shift() ?? [];
      const builder: any = {
        from: () => builder,
        where: () => builder,
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
          if (next && next.__error) return Promise.reject(next.__error);
          return Promise.resolve(next ?? { insertId: 1 });
        },
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

import { createWarehouse, pickNextWarehouseSlot } from "./db";
import { InventoryError } from "./db/errors";

function activeProject(id = 1, status = "active") {
  return { id, name: `مشروع ${id}`, code: `P${id}`, status };
}

beforeEach(() => {
  state.queue = [];
  state.inserts = [];
});

describe("pickNextWarehouseSlot", () => {
  it("يبدأ من الرقم 1 عندما لا توجد أرقام مستخدمة", () => {
    expect(pickNextWarehouseSlot([])).toBe(1);
  });

  it("يعيد أول فجوة متاحة بدلًا من أعلى رقم + 1", () => {
    expect(pickNextWarehouseSlot([1, 2, 4, 5])).toBe(3);
  });

  it("يتجاهل القيم غير الصالحة (سالب، صفر، عشري، نص)", () => {
    expect(pickNextWarehouseSlot([0, -3, 1.5, "abc", null, undefined, 2])).toBe(1);
    expect(pickNextWarehouseSlot(["1", "2", 3])).toBe(4);
  });
});

describe("createWarehouse - إنشاء مخزن داخل مشروع", () => {
  it("ينشئ المخزن في مشروع نشط ويختار أصغر رقم متاح", async () => {
    state.queue = [
      [activeProject(1)], // getProjectById
      [], // فحص تكرار الاسم
      [{ slot: 1 }, { slot: 3 }], // الأرقام المستخدمة
      { insertId: 10 }, // insert
      [{ id: 10, projectId: 1, slot: 2, name: "مخزن الأدوات" }], // قراءة الصف
    ];

    const row = await createWarehouse({ name: "  مخزن الأدوات  ", projectId: 1 });

    expect(row).toMatchObject({ id: 10, projectId: 1, slot: 2, name: "مخزن الأدوات" });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toEqual({ name: "مخزن الأدوات", projectId: 1, slot: 2 });
  });

  it("يسمح بالرقم 1 في مشروع B رغم وجود الرقم 1 في مشروع A", async () => {
    state.queue = [
      [activeProject(2)], // المشروع B
      [], // لا تكرار اسم داخل B
      [], // لا أرقام مستخدمة داخل B
      { insertId: 20 },
      [{ id: 20, projectId: 2, slot: 1, name: "مخزن B" }],
    ];

    const row = await createWarehouse({ name: "مخزن B", projectId: 2 });

    expect(row).toMatchObject({ projectId: 2, slot: 1 });
    expect(state.inserts[0]).toMatchObject({ projectId: 2, slot: 1 });
  });

  it("يرفض الاسم الفارغ", async () => {
    await expect(createWarehouse({ name: "   ", projectId: 1 })).rejects.toMatchObject({
      kind: "BAD_REQUEST",
      message: "اسم المخزن مطلوب",
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("يرفض الاسم الأطول من 128 حرفًا", async () => {
    await expect(createWarehouse({ name: "ا".repeat(129), projectId: 1 })).rejects.toBeInstanceOf(InventoryError);
    expect(state.inserts).toHaveLength(0);
  });

  it("يرفض المشروع المؤرشف", async () => {
    state.queue = [[activeProject(3, "archived")]];
    await expect(createWarehouse({ name: "مخزن", projectId: 3 })).rejects.toMatchObject({
      kind: "BAD_REQUEST",
      message: "لا يمكن إنشاء مخزن داخل مشروع مؤرشف",
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("يرفض المشروع غير الموجود", async () => {
    state.queue = [[]];
    await expect(createWarehouse({ name: "مخزن", projectId: 99 })).rejects.toMatchObject({
      kind: "NOT_FOUND",
      message: "المشروع غير موجود",
    });
  });

  it("يرفض projectId غير صالح قبل الوصول لقاعدة البيانات", async () => {
    await expect(createWarehouse({ name: "مخزن", projectId: 0 })).rejects.toMatchObject({
      kind: "BAD_REQUEST",
      message: "المشروع غير موجود",
    });
  });

  it("يرفض تكرار الاسم داخل نفس المشروع", async () => {
    state.queue = [
      [activeProject(1)],
      [{ id: 55 }], // اسم موجود مسبقًا
    ];
    await expect(createWarehouse({ name: "مخزن مكرر", projectId: 1 })).rejects.toMatchObject({
      kind: "CONFLICT",
      message: "اسم المخزن مستخدم داخل هذا المشروع",
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("يرفض رقم المخزن اليدوي المكرر داخل نفس المشروع", async () => {
    state.queue = [
      [activeProject(1)],
      [{ id: 77 }], // فحص الرقم اليدوي: مستخدم
    ];
    await expect(createWarehouse({ name: "مخزن", projectId: 1, slot: 2 })).rejects.toMatchObject({
      kind: "CONFLICT",
      message: "رقم المخزن مستخدم داخل هذا المشروع",
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("يعيد المحاولة عند تعارض القيد الفريد أثناء الاختيار التلقائي", async () => {
    state.queue = [
      [activeProject(1)],
      [], // الاسم متاح (المحاولة 1)
      [{ slot: 1 }], // الأرقام المستخدمة (المحاولة 1)
      { __error: Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }) }, // insert يفشل
      [], // الاسم متاح (المحاولة 2)
      [{ slot: 1 }, { slot: 2 }], // الأرقام بعد سباق
      { insertId: 12 },
      [{ id: 12, projectId: 1, slot: 3, name: "مخزن" }],
    ];

    const row = await createWarehouse({ name: "مخزن", projectId: 1 });

    expect(row).toMatchObject({ id: 12, slot: 3 });
    expect(state.inserts).toHaveLength(2);
  });

  it("لا يكتب إلا صف مخزن واحد ولا يلمس الأرصدة أو الأصناف أو الحركات", async () => {
    state.queue = [
      [activeProject(1)],
      [],
      [{ slot: 1 }],
      { insertId: 15 },
      [{ id: 15, projectId: 1, slot: 2, name: "مخزن" }],
    ];

    await createWarehouse({ name: "مخزن", projectId: 1 });

    // العملية الوحيدة المسجّلة هي إدخال مخزن واحد بحقول محددة فقط.
    expect(state.inserts).toHaveLength(1);
    expect(Object.keys(state.inserts[0]).sort()).toEqual(["name", "projectId", "slot"]);
  });
});
