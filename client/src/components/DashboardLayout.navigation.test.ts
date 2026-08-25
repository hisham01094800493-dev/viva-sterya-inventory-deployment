import { describe, expect, it } from "vitest";
import { buildGovernanceNavigationItems, SIDEBAR_VISUAL_CLASSES } from "./DashboardLayout";

describe("buildGovernanceNavigationItems", () => {
  it("exposes the migration import link to admins only", () => {
    expect(buildGovernanceNavigationItems("admin").some(item => item.path === "/migration-import")).toBe(true);
    expect(buildGovernanceNavigationItems("manager").some(item => item.path === "/migration-import")).toBe(false);
    expect(buildGovernanceNavigationItems("user").some(item => item.path === "/migration-import")).toBe(false);
  });

  it("retains the semantic hooks for the transparent, high-contrast sidebar", () => {
    expect(SIDEBAR_VISUAL_CLASSES.surface).toBe("smart-sidebar-surface");
    expect(SIDEBAR_VISUAL_CLASSES.navigationItem).toBe("smart-sidebar-nav-item");
    expect(SIDEBAR_VISUAL_CLASSES.activeNavigationItem).toBe("smart-sidebar-nav-item-active");
    expect(SIDEBAR_VISUAL_CLASSES.icon).toBe("smart-sidebar-nav-icon");
  });
});
