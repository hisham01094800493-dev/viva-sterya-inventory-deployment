import { describe, expect, it } from "vitest";
import { DEFAULT_COMPANY_LOGO_URL, resolveCompanyLogoUrl } from "./brandAssets";

describe("resolveCompanyLogoUrl", () => {
  it("uses a Railway-hosted fallback for old Manus storage references", () => {
    expect(resolveCompanyLogoUrl("/manus-storage/company/logo.png")).toBe(DEFAULT_COMPANY_LOGO_URL);
  });

  it("preserves a future uploaded company logo from the Railway storage proxy", () => {
    expect(resolveCompanyLogoUrl("/api/files/company/logo.png")).toBe("/api/files/company/logo.png");
  });
});
