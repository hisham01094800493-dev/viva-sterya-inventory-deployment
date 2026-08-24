import { getInventoryRows, getSettingValue } from "./db";
import { notifyOwner } from "./_core/notification";
import { sendWhatsAppNotification } from "./whatsapp";
import { sendConfiguredEmail, verifyConfiguredSmtp } from "./email";

export type InventoryReportRow = {
  code: string;
  name: string;
  currentStock: string | number;
  incomingStock: string | number;
  outgoingStock: string | number;
  reorderLevel: string | number;
  category?: string | null;
  unit?: string | null;
};

export function getLowStockItems(rows: InventoryReportRow[], thresholdPercentage: number) {
  const threshold = Math.min(100, Math.max(0, thresholdPercentage));
  return rows.filter(row => {
    const current = Number(row.currentStock ?? 0);
    const reorder = Number(row.reorderLevel ?? 0);
    if (reorder <= 0) return current <= 0;
    return current <= reorder * (threshold / 100);
  });
}

function formatNumber(value: string | number | null | undefined) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 3 }).format(Number(value ?? 0));
}

export function buildInventoryReportHtml(rows: InventoryReportRow[], thresholdPercentage: number, title: string) {
  const lowStock = getLowStockItems(rows, thresholdPercentage);
  const bodyRows = rows.map(row => {
    const isLow = lowStock.some(low => low.code === row.code);
    return `<tr style="background:${isLow ? "#fff7ed" : "#ffffff"}"><td>${row.code}</td><td>${row.name}</td><td>${formatNumber(row.currentStock)} ${row.unit ?? ""}</td><td>${formatNumber(row.incomingStock)}</td><td>${formatNumber(row.outgoingStock)}</td><td>${formatNumber(row.reorderLevel)}</td><td style="color:${isLow ? "#b45309" : "#0f766e"};font-weight:700">${isLow ? "يحتاج متابعة" : "مستقر"}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#102a43"><div style="max-width:900px;margin:0 auto;padding:28px"><div style="background:#0d4f62;color:#fff;padding:26px;border-radius:18px"><div style="font-size:11px;letter-spacing:3px;color:#f1c27d">SMART INVENTORY</div><h1 style="margin:12px 0 5px;font-size:24px">${title}</h1><p style="margin:0;color:#dceff2">نسبة التنبيه الحالية: ${formatNumber(thresholdPercentage)}%</p></div><div style="display:flex;gap:12px;margin:18px 0"><div style="background:#fff;border-radius:14px;padding:16px;flex:1"><b>إجمالي الأصناف</b><div style="font-size:24px;margin-top:8px">${rows.length}</div></div><div style="background:#fff7ed;border-radius:14px;padding:16px;flex:1"><b>تحتاج متابعة</b><div style="font-size:24px;margin-top:8px;color:#b45309">${lowStock.length}</div></div></div><div style="background:#fff;border-radius:14px;padding:10px;overflow:auto"><table style="width:100%;border-collapse:collapse;text-align:right;font-size:13px"><thead><tr style="background:#edf6f7"><th style="padding:12px">الكود</th><th style="padding:12px">الصنف</th><th style="padding:12px">الرصيد</th><th style="padding:12px">الوارد</th><th style="padding:12px">المنصرف</th><th style="padding:12px">حد الطلب</th><th style="padding:12px">الحالة</th></tr></thead><tbody>${bodyRows}</tbody></table></div><p style="color:#8291a1;font-size:12px;margin-top:18px">تم إنشاء هذا التقرير تلقائياً بواسطة نظام Smart Inventory.</p></div></body></html>`;
}

function configuredRecipients(raw: string) {
  return raw.split(/[;,\n]/).map(value => value.trim()).filter(Boolean);
}

export async function verifySmtpConnection() {
  return verifyConfiguredSmtp();
}

export async function runInventoryReport(kind: "low_stock" | "daily" | "weekly") {
  const [rows, thresholdRaw, recipientsRaw] = await Promise.all([
    getInventoryRows(),
    getSettingValue("threshold_percentage", "20"),
    getSettingValue("report_recipients", process.env.INVENTORY_REPORT_EMAILS ?? ""),
  ]);
  const thresholdPercentage = Math.min(100, Math.max(0, Number(thresholdRaw) || 20));
  const lowStock = getLowStockItems(rows, thresholdPercentage);
  if (kind === "low_stock" && lowStock.length === 0) {
    return { kind, lowStockCount: 0, sent: false, fallbackNotified: false, reason: "no-low-stock" };
  }
  const title = kind === "low_stock" ? "تنبيه أصناف تحتاج متابعة" : kind === "daily" ? "التقرير اليومي للمخزون" : "التقرير الأسبوعي للمخزون";
  const reportRows = kind === "low_stock" ? lowStock : rows;
  const html = buildInventoryReportHtml(reportRows, thresholdPercentage, title);
  const recipients = configuredRecipients(recipientsRaw);
  let sent = false;
  let fallbackNotified = false;
  try {
    sent = await sendConfiguredEmail({ subject: `Smart Inventory — ${title}`, html, recipients });
  } catch (error) {
    console.error("[Reports] SMTP send failed:", error);
  }
  if (!sent) {
    fallbackNotified = await notifyOwner({
      title,
      content: `عدد الأصناف في التقرير: ${reportRows.length}. الأصناف التي تحتاج متابعة: ${lowStock.length}. لم يتم إرسال البريد لأن إعدادات SMTP أو المستلمين غير مكتملة.`,
    });
  }

  // إرسال تنبيه عبر واتساب بالتوازي مع إشعار المالك
  await sendWhatsAppNotification(`📦 *Smart Inventory - ${title}*\n- إجمالي الأصناف: ${reportRows.length}\n- الأصناف التي تحتاج متابعة: ${lowStock.length}\n- نسبة حد الطلب: ${thresholdPercentage}%`);

  return { kind, lowStockCount: lowStock.length, sent, fallbackNotified, recipients: recipients.length };
}
