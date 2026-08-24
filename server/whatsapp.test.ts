import { describe, it, expect } from "vitest";
import { sendWhatsAppNotification } from "./whatsapp";

describe("WhatsApp Notification Service", () => {
  it("should return failure gracefully when credentials are missing", async () => {
    const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;

    const res = await sendWhatsAppNotification("Test message");
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();

    if (originalToken) process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
  });
});
