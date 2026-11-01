import { describe, expect, it } from "vitest";
import { DEFAULT_COMPANY_LOGO_URL, resolveCompanyLogoUrl } from "./brandAssets";

describe("resolveCompanyLogoUrl", () => {
  it("leaves the company logo empty when none is configured", () => {
    expect(resolveCompanyLogoUrl(null)).toBeNull();
    expect(resolveCompanyLogoUrl("   ")).toBeNull();
  });

  it("does not substitute the app icon for inaccessible legacy logo references", () => {
    const logo = resolveCompanyLogoUrl("/manus-storage/company/logo.png");
    expect(logo).toBeNull();
    expect(logo).not.toBe(DEFAULT_COMPANY_LOGO_URL);
  });

  it("preserves a future uploaded company logo from the Railway storage proxy", () => {
    expect(resolveCompanyLogoUrl("/api/files/company/logo.png")).toBe("/api/files/company/logo.png");
  });
});
