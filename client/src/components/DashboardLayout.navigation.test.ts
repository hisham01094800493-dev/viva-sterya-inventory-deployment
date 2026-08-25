import { describe, expect, it } from "vitest";
import { buildGovernanceNavigationItems } from "./DashboardLayout";

describe("buildGovernanceNavigationItems", () => {
  it("exposes the migration import link to admins only", () => {
    expect(buildGovernanceNavigationItems("admin").some(item => item.path === "/migration-import")).toBe(true);
    expect(buildGovernanceNavigationItems("manager").some(item => item.path === "/migration-import")).toBe(false);
    expect(buildGovernanceNavigationItems("user").some(item => item.path === "/migration-import")).toBe(false);
  });
});
