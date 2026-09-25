import { describe, expect, it } from "vitest";
import { buildGovernanceNavigationItems, buildNavigationGroups, canAccessMigrationImport, isNavigationPathActive, SIDEBAR_VISUAL_CLASSES } from "./DashboardLayout";

describe("buildGovernanceNavigationItems", () => {
  it("exposes the migration import link to admins only", () => {
    expect(buildGovernanceNavigationItems("admin").some(item => item.path === "/migration-import")).toBe(true);
    expect(buildGovernanceNavigationItems("manager").some(item => item.path === "/migration-import")).toBe(false);
    expect(buildGovernanceNavigationItems("user").some(item => item.path === "/migration-import")).toBe(false);
  });

  it("keeps the settings import shortcut restricted to administrators", () => {
    expect(canAccessMigrationImport("admin")).toBe(true);
    expect(canAccessMigrationImport("manager")).toBe(false);
    expect(canAccessMigrationImport("user")).toBe(false);
  });

  it("retains the semantic hooks for the transparent, high-contrast sidebar", () => {
    expect(SIDEBAR_VISUAL_CLASSES.surface).toBe("smart-sidebar-surface");
    expect(SIDEBAR_VISUAL_CLASSES.navigationItem).toBe("smart-sidebar-nav-item");
    expect(SIDEBAR_VISUAL_CLASSES.activeNavigationItem).toBe("smart-sidebar-nav-item-active");
    expect(SIDEBAR_VISUAL_CLASSES.icon).toBe("smart-sidebar-nav-icon");
  });

  it("organizes real routes into focused expandable sections", () => {
    const items = [
      { icon: () => null, label: "الرئيسية", path: "/" },
      { icon: () => null, label: "الأصناف", path: "/items" },
      { icon: () => null, label: "المخازن", path: "/warehouses" },
      { icon: () => null, label: "التقارير", path: "/reports" },
    ];
    const groups = buildNavigationGroups(items);
    expect(groups.map(group => group.id)).toEqual(["home", "inventory", "reports"]);
    expect(groups.find(group => group.id === "inventory")?.items.map(item => item.path)).toEqual(["/items", "/warehouses"]);
  });

  it("recognizes nested routes while keeping query shortcuts exact", () => {
    expect(isNavigationPathActive("/warehouses", "/warehouses/2")).toBe(true);
    expect(isNavigationPathActive("/governance?tab=backups", "/governance?tab=backups")).toBe(true);
    expect(isNavigationPathActive("/governance?tab=backups", "/governance?tab=backup-center")).toBe(false);
  });
});
