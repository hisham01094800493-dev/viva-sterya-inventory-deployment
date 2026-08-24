// استخدام fetch المدمج في بيئة Node الحديثة

interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWhatsAppNotification(message: string, targetPhone?: string): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = targetPhone || process.env.WHATSAPP_RECIPIENT_PHONE;

  if (!token || !phoneNumberId || !recipient) {
    console.log("[WhatsApp] Skipped: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_RECIPIENT_PHONE not configured.");
    return { success: false, error: "Missing WhatsApp configuration credentials." };
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient.replace(/[^0-9]/g, ""),
        type: "text",
        text: {
          body: message,
        },
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok) {
      return {
        success: false,
        error: data?.error?.message || `HTTP error ${response.status}`,
      };
    }

    return {
      success: true,
      messageId: data?.messages?.[0]?.id,
    };
  } catch (err: any) {
    console.error("[WhatsApp] Error sending message:", err);
    return { success: false, error: err?.message || "Unknown network error" };
  }
}
