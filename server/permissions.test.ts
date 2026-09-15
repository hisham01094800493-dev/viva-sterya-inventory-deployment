import { describe, expect, it } from "vitest";

const readOnlyRoles = new Set(["viewer", "reviewer", "reports"]);
const entryRoles = new Set(["admin", "manager", "operator", "user"]);

function canCreateInventory(role: string) {
  return entryRoles.has(role) && !readOnlyRoles.has(role);
}

function canAccess(allowed: string[], key: string) {
  return allowed.includes(key);
}

function canAccessWarehouses(allowed: number[], requested: Array<number | null | undefined>) {
  if (!allowed.length) return true;
  const ids = requested.filter((id): id is number => typeof id === "number");
  return ids.length > 0 && ids.every(id => allowed.includes(id));
}

describe("role permission policy", () => {
  it("allows viewer to read while denying inventory creation", () => {
    expect(readOnlyRoles.has("viewer")).toBe(true);
    expect(canCreateInventory("viewer")).toBe(false);
  });

  it("keeps operational roles capable of creating inventory entries", () => {
    expect(canCreateInventory("admin")).toBe(true);
    expect(canCreateInventory("manager")).toBe(true);
    expect(canCreateInventory("operator")).toBe(true);
    expect(canCreateInventory("user")).toBe(true);
  });

  it("keeps report and reviewer roles read-only", () => {
    expect(canCreateInventory("reports")).toBe(false);
    expect(canCreateInventory("reviewer")).toBe(false);
  });

  it("treats team chat as an independently configurable screen", () => {
    const defaultScreens = ["dashboard", "inventory", "reports", "alerts", "chat"];
    expect(canAccess(defaultScreens, "chat")).toBe(true);
    expect(canAccess(defaultScreens.filter(screen => screen !== "chat"), "chat")).toBe(false);
  });

  it("supports restricting one user to selected screens and reports", () => {
    const screens = ["dashboard", "inventory", "reports"];
    const reports = ["item-card", "movement-reports"];
    expect(canAccess(screens, "inventory")).toBe(true);
    expect(canAccess(screens, "additions")).toBe(false);
    expect(canAccess(reports, "item-card")).toBe(true);
    expect(canAccess(reports, "customer-account")).toBe(false);
  });

  it("allows only explicitly assigned warehouses for restricted users", () => {
    expect(canAccessWarehouses([2, 4], [2])).toBe(true);
    expect(canAccessWarehouses([2, 4], [3])).toBe(false);
    expect(canAccessWarehouses([2, 4], [2, 4])).toBe(true);
    expect(canAccessWarehouses([2, 4], [2, 5])).toBe(false);
    expect(canAccessWarehouses([2, 4], [null])).toBe(false);
  });
});

export { canCreateInventory, canAccess, canAccessWarehouses, readOnlyRoles };
