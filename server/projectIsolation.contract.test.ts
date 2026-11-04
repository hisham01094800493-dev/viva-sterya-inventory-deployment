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
