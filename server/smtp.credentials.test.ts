import { describe, expect, it } from "vitest";
import { verifyConfiguredSmtp } from "./email";

describe("SMTP configuration fallback", () => {
  it("reports the expected state when SMTP credentials are absent in local tests", async () => {
    const result = await verifyConfiguredSmtp();
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      expect(result).toEqual({ configured: false, verified: false });
      return;
    }
    expect(result.configured).toBe(true);
  });
});
