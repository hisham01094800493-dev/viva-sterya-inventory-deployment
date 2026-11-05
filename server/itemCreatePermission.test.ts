import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ربط صلاحية إنشاء الصنف", () => {
  const routers = readFileSync(
    resolve(process.cwd(), "server/routers.ts"),
    "utf8"
  );
  const itemsPage = readFileSync(
    resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"),
    "utf8"
  );
  const dashboard = readFileSync(
    resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"),
    "utf8"
  );

  it("protects item creation on the server and gates both creation entry points", () => {
    expect(routers).toContain("create: itemCreateProcedure");
    expect(routers).toContain(".input(itemInput)");
    expect(routers).toContain("importBulk: itemCreateProcedure");
    expect(itemsPage).toContain("createButton.hidden = !canCreateItems");
    expect(itemsPage).toContain('get("create") === "1"');
    expect(dashboard).toContain("canCreateItems={canCreateItems}");
    expect(dashboard).toContain('path: "/items?create=1"');
  });

  it("يعزل مخزن الصنف عن المشروع النشط أثناء التبديل", () => {
    expect(itemsPage).toContain("item.projectId === activeProjectId");
    expect(itemsPage).toContain(
      "selectedWarehouse.projectId !== activeProjectId"
    );
    expect(itemsPage).toContain("void warehouses.refetch()");
    expect(itemsPage).toContain(
      "جارٍ تحديث المشروع، انتظر لحظة ثم حاول مرة أخرى"
    );
  });

  it("يخفي رسالة SQL الخام عن المستخدم", () => {
    expect(routers).toContain('message.startsWith("Failed query:")');
    expect(routers).toContain("عدم توافق قاعدة البيانات مع نسخة البرنامج");
  });
});
