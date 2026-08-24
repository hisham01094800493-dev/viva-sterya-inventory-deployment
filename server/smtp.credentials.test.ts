import { describe, expect, it } from "vitest";
import { verifyConfiguredSmtp } from "./email";

describe("SMTP configuration fallback", () => {
  it("verifies the configured SMTP connection without sending an email", async () => {
    const result = await verifyConfiguredSmtp();
    expect(result).toEqual({ configured: true, verified: true });
  });
});
