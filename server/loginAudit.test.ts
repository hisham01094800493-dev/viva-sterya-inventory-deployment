import { describe, expect, it } from "vitest";
import { detectDeviceType } from "./_core/oauth";

describe("سجل دخول المستخدمين", () => {
  it("يصنف الجهاز من User-Agent دون حفظ بيانات حساسة", () => {
    expect(detectDeviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile")).toBe("mobile");
    expect(detectDeviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("mobile");
    expect(detectDeviceType("Mozilla/5.0 (Linux; Android 14; Tablet) Tablet")).toBe("mobile");
    expect(detectDeviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0")).toBe("desktop");
  });
});
