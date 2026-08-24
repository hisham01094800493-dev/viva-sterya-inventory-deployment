import { z } from "zod";
import { adminProcedure, router } from "./trpc.js";
import { sendWhatsAppNotification } from "./whatsapp.js";
import { getSettingValue, upsertSetting } from "./db.js";

export const whatsappRouter = router({
  getConfig: adminProcedure.query(async () => {
    const phone = await getSettingValue("whatsapp_phone", "");
    const configured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    return { configured, phone };
  }),

  savePhone: adminProcedure
    .input(z.object({ phone: z.string().trim().min(8, "رقم الهاتف غير صحيح") }))
    .mutation(async ({ input }) => {
      await upsertSetting({
        key: "whatsapp_phone",
        value: input.phone,
        description: "رقم هاتف مسؤول المستودع لتلقي إشعارات واتساب",
      });
      return { success: true };
    }),

  testMessage: adminProcedure
    .input(z.object({ phone: z.string().trim().min(8, "رقم الهاتف مطلوب") }))
    .mutation(async ({ input }) => {
      const res = await sendWhatsAppNotification(
        "🧪 *Smart Inventory - اختبار الاتصال*\nتم ربط النظام بنجاح مع WhatsApp Cloud API لإرسال تنبيهات المخزون.",
        input.phone
      );
      if (!res.success) {
        throw new Error(res.error || "فشل إرسال رسالة واتساب التجريبية");
      }
      return res;
    }),
});
