import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract tests for multi-project isolation.
 *
 * These tests do not touch the database. Instead they assert that the actual
 * server source keeps the project-scoping guards wired in. They exist to catch
 * regressions where a query/mutation silently loses its project filter — the
 * exact class of bug that caused cross-project data to leak from the paged
 * movement lists before this work.
 */

const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  if (start === -1) throw new Error(`function ${name} not found`);
  // Grab a generous slice; isolation conditions appear early in each function.
  return source.slice(start, start + 6000);
}

describe("paged movement lists are scoped by project", () => {
  for (const [fn, table] of [
    ["listAdditionsPaged", "additions"],
    ["listDisbursementsPaged", "disbursements"],
    ["listTransfersPaged", "transfers"],
  ] as const) {
    it(`${fn} pushes a projectId condition on ${table}`, () => {
      const body = functionBody(dbSource, fn);
      expect(body).toContain("projectId");
      expect(body).toMatch(
        new RegExp(
          `if\\s*\\(\\s*projectId\\s*!=\\s*null\\s*\\)\\s*conditions\\.push\\(\\s*eq\\(\\s*${table}\\.projectId,\\s*projectId\\s*\\)`,
        ),
      );
    });
  }
});

describe("write-path isolation guards are wired into routers", () => {
  it("defines the warehouse/movement/item project guards", () => {
    expect(routerSource).toContain("async function assertWarehousesInProject");
    expect(routerSource).toContain("async function assertMovementInProject");
    expect(routerSource).toContain("function assertItemInProject");
  });

  it("guards warehouse usage on item + movement creation", () => {
    const occurrences = routerSource.match(/assertWarehousesInProject\(/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
  });

  it("guards existing movements before update/cancel/image operations", () => {
    const occurrences = routerSource.match(/assertMovementInProject\(/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(9);
  });

  it("guards item ownership before read/edit/delete", () => {
    const occurrences = routerSource.match(/assertItemInProject\(/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
  });
});

describe("project scope is resolved from the server, never trusted from the client", () => {
  it("uses resolveProjectScope across routers", () => {
    const occurrences = routerSource.match(/resolveProjectScope\(/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(20);
  });

  it("passes projectId into account statements and item cards", () => {
    expect(routerSource).toMatch(/listSupplierAccount\([^)]*scope\.projectId/s);
    expect(routerSource).toMatch(/listCustomerAccount\([^)]*scope\.projectId/s);
    expect(routerSource).toMatch(/getItemCard\([^)]*scope\.projectId/s);
  });
});

describe("write paths stamp the resolved project onto inserted rows", () => {
  it("createDisbursementBatch persists the resolved projectId", () => {
    const start = dbSource.indexOf("export async function createDisbursementBatch");
    expect(start).toBeGreaterThan(-1);
    const body = dbSource.slice(start, start + 9000);
    expect(body).toContain("const writeProjectId = await resolveWriteProjectId(tx, input.projectId)");
    expect(body).toMatch(/projectId:\s*writeProjectId/);
  });
});

describe("phase 3: item and warehouse isolation", () => {
  it("guards item edits against cross-project warehouse moves", () => {
    expect(routerSource).toMatch(
      /assertItemInProject\(existing, scope\.projectId\); if \(input\.warehouseId != null\) await assertWarehousesInProject\(scope\.projectId, \[input\.warehouseId\]\)/,
    );
  });

  it("guards the suggested item code against a warehouse from another project", () => {
    expect(routerSource).toMatch(
      /if \(input\?\.warehouseId != null\) await assertWarehousesInProject\(scope\.projectId, \[input\.warehouseId\]\)/,
    );
  });

  it("resolves the main warehouse per project instead of hardcoding warehouse id 1", () => {
    expect(routerSource).not.toContain("!permissions.allowedWarehouseIds.includes(1)");
    const start = dbSource.indexOf("export async function getMainWarehouseItemCards");
    expect(start).toBeGreaterThan(-1);
    const body = dbSource.slice(start, start + 1200);
    expect(body).toContain("eq(warehouses.slot, 1)");
    expect(body).toContain("eq(warehouses.projectId, projectId)");
  });
});
