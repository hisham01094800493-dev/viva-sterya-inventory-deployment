import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ربط صلاحية إنشاء الصنف", () => {
  const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const itemsPage = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
  const dashboard = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");

  it("protects item creation on the server and gates both creation entry points", () => {
    expect(routers).toContain("create: itemCreateProcedure.input(itemInput)");
    expect(routers).toContain("importBulk: itemCreateProcedure");
    expect(itemsPage).toContain("createButton.hidden = !canCreateItems");
    expect(itemsPage).toContain("get(\"create\") === \"1\"");
    expect(dashboard).toContain("canCreateItems={canCreateItems}");
    expect(dashboard).toContain('path: "/items?create=1"');
  });
});
