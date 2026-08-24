import { describe, expect, it } from "vitest";
import { buildGoogleOpenId } from "./db";
import { detectDeviceType } from "./_core/oauth";

describe("Google OAuth identity helpers", () => {
  it("creates a stable Google identity while rejecting an empty subject", () => {
    expect(buildGoogleOpenId("  123456  ")).toBe("google:123456");
    expect(() => buildGoogleOpenId(" ")).toThrow("معرّف Google غير صالح");
  });

  it("keeps audit-device labels correct for phones and desktop browsers", () => {
    expect(detectDeviceType("Mozilla/5.0 (Linux; Android 14) Mobile")).toBe("mobile");
    expect(detectDeviceType("Mozilla/5.0 (X11; Linux x86_64)")).toBe("desktop");
  });
});
