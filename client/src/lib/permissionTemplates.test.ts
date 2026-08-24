import { describe, expect, it } from "vitest";
import { getPermissionTemplate } from "./permissionTemplates";

describe("permission templates", () => {
  it("defines the site engineer as a read-only reporting and inventory reviewer", () => {
    const template = getPermissionTemplate("siteEngineer");
    expect(template.label).toBe("مهندس موقع");
    expect(template.readOnly).toBe(true);
    expect(template.screens).toEqual(["inventory", "additions", "suppliers", "reports"]);
    expect(template.reports).toContain("item-card");
    expect(template.reports).toContain("movement-reports");
    expect(template.screens).not.toContain("disbursements");
    expect(template.screens).not.toContain("transfers");
  });
});
