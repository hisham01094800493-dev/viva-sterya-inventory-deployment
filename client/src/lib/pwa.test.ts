import { describe, expect, it } from "vitest";
import { getPwaInstallInstructions } from "./pwa";

describe("getPwaInstallInstructions", () => {
  it("provides Safari instructions for iPhone users", () => {
    expect(getPwaInstallInstructions("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toContain("Safari");
  });

  it("provides Chrome menu instructions for Android users", () => {
    expect(getPwaInstallInstructions("Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120.0")).toContain("Chrome");
  });
});
