import { getDailyDisbursementRows, getInventoryRows, getSettingValue } from "./db";
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

export type DailyDisbursementRow = {
  date: string;
  eznNum: string;
  itemCode: string;
  itemName: string | null;
  quantity: string | number;
  totalValue: string | number | null;
  unit: string | null;
};

export type DailyDisbursementSummary = {
  permitCount: number;
  lineCount: number;
  correctionCount: number;
  netValue: number;
  quantityByUnit: Array<{ unit: string; quantity: number }>;
  items: Array<{ itemCode: string; itemName: string; unit: string; quantity: number; totalValue: number }>;
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

export function getItemsAtOrBelowMinimum(rows: InventoryReportRow[]) {
  return getLowStockItems(rows, 100);
}

function formatNumber(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3, useGrouping: false }).format(Number.isFinite(numeric) ? numeric : 0);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function summarizeDailyDisbursements(rows: DailyDisbursementRow[]): DailyDisbursementSummary {
  const permitNumbers = new Set<string>();
  const quantities = new Map<string, number>();
  const items = new Map<string, { itemCode: string; itemName: string; unit: string; quantity: number; totalValue: number }>();
  let netValue = 0;
  let correctionCount = 0;

  rows.forEach((row, index) => {
    const quantity = Number(row.quantity ?? 0) || 0;
    const totalValue = Number(row.totalValue ?? 0) || 0;
    const unit = row.unit?.trim() || "غير محدد";
    const itemCode = row.itemCode?.trim() || "غير محدد";
    const itemName = row.itemName?.trim() || itemCode;
    const permitNumber = row.eznNum?.trim();
    permitNumbers.add(permitNumber || `line-${index}`);
    netValue += totalValue;
    if (quantity < 0 || totalValue < 0) correctionCount += 1;
    quantities.set(unit, (quantities.get(unit) ?? 0) + quantity);

    const key = `${itemCode}\u0000${unit}`;
    const item = items.get(key) ?? { itemCode, itemName, unit, quantity: 0, totalValue: 0 };
    item.quantity += quantity;
    item.totalValue += totalValue;
    items.set(key, item);
  });

  return {
    permitCount: permitNumbers.size,
    lineCount: rows.length,
    correctionCount,
    netValue,
    quantityByUnit: Array.from(quantities, ([unit, quantity]) => ({ unit, quantity })).sort((left, right) => left.unit.localeCompare(right.unit, "ar")),
    items: Array.from(items.values()).sort((left, right) => Math.abs(right.totalValue) - Math.abs(left.totalValue) || left.itemCode.localeCompare(right.itemCode, "ar")),
  };
}

export function buildInventoryReportHtml(rows: InventoryReportRow[], thresholdPercentage: number, title: string) {
  const lowStock = getLowStockItems(rows, thresholdPercentage);
  const lowStockCodes = new Set(lowStock.map(row => row.code));
  const bodyRows = rows.map(row => {
    const isLow = lowStockCodes.has(row.code);
    const unit = escapeHtml(row.unit || "وحدة");
    return `<tr style="background:${isLow ? "#fff7ed" : "#ffffff"}"><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.name)}</td><td>${formatNumber(row.currentStock)} ${unit}</td><td>${formatNumber(row.incomingStock)} ${unit}</td><td>${formatNumber(row.outgoingStock)} ${unit}</td><td>${formatNumber(row.reorderLevel)} ${unit}</td><td style="color:${isLow ? "#b45309" : "#0f766e"};font-weight:700">${isLow ? "يحتاج متابعة" : "مستقر"}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#102a43"><div style="max-width:900px;margin:0 auto;padding:28px"><div style="background:#0d4f62;color:#fff;padding:26px;border-radius:18px"><div style="font-size:11px;letter-spacing:3px;color:#f1c27d">SMART INVENTORY</div><h1 style="margin:12px 0 5px;font-size:24px">${escapeHtml(title)}</h1><p style="margin:0;color:#dceff2">نسبة التنبيه الحالية: ${formatNumber(thresholdPercentage)}%</p></div><div style="display:flex;gap:12px;margin:18px 0"><div style="background:#fff;border-radius:14px;padding:16px;flex:1"><b>إجمالي الأصناف</b><div style="font-size:24px;margin-top:8px">${rows.length}</div></div><div style="background:#fff7ed;border-radius:14px;padding:16px;flex:1"><b>تحتاج متابعة</b><div style="font-size:24px;margin-top:8px;color:#b45309">${lowStock.length}</div></div></div><div style="background:#fff;border-radius:14px;padding:10px;overflow:auto"><table style="width:100%;border-collapse:collapse;text-align:right;font-size:13px"><thead><tr style="background:#edf6f7"><th style="padding:12px">الكود</th><th style="padding:12px">الصنف</th><th style="padding:12px">الرصيد</th><th style="padding:12px">الوارد</th><th style="padding:12px">المنصرف</th><th style="padding:12px">حد الطلب</th><th style="padding:12px">الحالة</th></tr></thead><tbody>${bodyRows}</tbody></table></div><p style="color:#8291a1;font-size:12px;margin-top:18px">تم إنشاء هذا التقرير تلقائياً بواسطة نظام Smart Inventory.</p></div></body></html>`;
}

export function buildDailyInventoryReportHtml(
  rows: InventoryReportRow[],
  thresholdPercentage: number,
  summary: DailyDisbursementSummary,
  reportDate: string,
) {
  const minimumStockItems = getItemsAtOrBelowMinimum(rows);
  const severeLowStockCodes = new Set(getLowStockItems(rows, thresholdPercentage).map(row => row.code));
  const stockRows = minimumStockItems.length
    ? minimumStockItems.map(row => {
      const severe = severeLowStockCodes.has(row.code);
      const unit = escapeHtml(row.unit || "وحدة");
      const status = severe ? "انخفاض حاد" : "وصل إلى حد الطلب أو دونه";
      const color = severe ? "#b42318" : "#b45309";
      return `<tr><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.name)}</td><td>${formatNumber(row.currentStock)} ${unit}</td><td>${formatNumber(row.reorderLevel)} ${unit}</td><td style="color:${color};font-weight:700">${status}</td></tr>`;
    }).join("")
    : `<tr><td colspan="5" style="padding:16px;text-align:center;color:#0f766e">لا توجد أصناف عند حد الطلب أو دونه اليوم.</td></tr>`;
  const unitRows = summary.quantityByUnit.length
    ? summary.quantityByUnit.map(row => `<tr><td>${escapeHtml(row.unit)}</td><td>${formatNumber(row.quantity)}</td></tr>`).join("")
    : `<tr><td colspan="2" style="padding:14px;text-align:center;color:#8291a1">لا توجد أذونات صرف مسجلة اليوم.</td></tr>`;
  const disbursementRows = summary.items.length
    ? summary.items.map(row => `<tr><td>${escapeHtml(row.itemCode)}</td><td>${escapeHtml(row.itemName)}</td><td>${formatNumber(row.quantity)} ${escapeHtml(row.unit)}</td><td>${formatNumber(row.totalValue)} ج.م</td></tr>`).join("")
    : `<tr><td colspan="4" style="padding:14px;text-align:center;color:#8291a1">لا توجد تفاصيل صرف لهذا اليوم.</td></tr>`;
  const criticalCount = minimumStockItems.filter(row => severeLowStockCodes.has(row.code)).length;

  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#102a43"><div style="max-width:900px;margin:0 auto;padding:28px"><div style="background:#0d4f62;color:#fff;padding:26px;border-radius:18px"><div style="font-size:11px;letter-spacing:3px;color:#f1c27d">SMART INVENTORY</div><h1 style="margin:12px 0 5px;font-size:24px">ملخص المخزون والصرف اليومي</h1><p style="margin:0;color:#dceff2">تاريخ التقرير: ${escapeHtml(reportDate)} · نسبة تمييز الانخفاض الحاد: ${formatNumber(thresholdPercentage)}%</p></div><div style="display:flex;flex-wrap:wrap;gap:12px;margin:18px 0"><div style="background:#fff7ed;border-radius:14px;padding:16px;flex:1;min-width:150px"><b>عند حد الطلب أو دونه</b><div style="font-size:24px;margin-top:8px;color:#b45309">${minimumStockItems.length}</div></div><div style="background:#fff1f0;border-radius:14px;padding:16px;flex:1;min-width:150px"><b>انخفاض حاد</b><div style="font-size:24px;margin-top:8px;color:#b42318">${criticalCount}</div></div><div style="background:#fff;border-radius:14px;padding:16px;flex:1;min-width:150px"><b>أذونات الصرف</b><div style="font-size:24px;margin-top:8px">${summary.permitCount}</div></div><div style="background:#eef7f7;border-radius:14px;padding:16px;flex:1;min-width:150px"><b>صافي قيمة الصرف</b><div style="font-size:24px;margin-top:8px;color:#0d4f62">${formatNumber(summary.netValue)} ج.م</div></div></div><section style="margin-top:22px"><h2 style="font-size:18px">الأصناف التي وصلت للحد الأدنى أو دونه</h2><div style="background:#fff;border-radius:14px;padding:10px;overflow:auto"><table style="width:100%;border-collapse:collapse;text-align:right;font-size:13px"><thead><tr style="background:#edf6f7"><th style="padding:12px">الكود</th><th style="padding:12px">الصنف</th><th style="padding:12px">الرصيد الحالي</th><th style="padding:12px">حد الطلب</th><th style="padding:12px">الحالة</th></tr></thead><tbody>${stockRows}</tbody></table></div></section><section style="margin-top:22px"><h2 style="font-size:18px">كميات الصرف حسب الوحدة</h2><p style="font-size:12px;color:#64748b">تُجمع كل وحدة على حدة ولا تُخلط الأطنان بالأمتار أو بالعدد. الكميات والقيم صافية من أي تصحيح سالب مسجل.</p><div style="background:#fff;border-radius:14px;padding:10px;overflow:auto"><table style="width:100%;border-collapse:collapse;text-align:right;font-size:13px"><thead><tr style="background:#edf6f7"><th style="padding:12px">الوحدة</th><th style="padding:12px">صافي الكمية</th></tr></thead><tbody>${unitRows}</tbody></table></div></section><section style="margin-top:22px"><h2 style="font-size:18px">تفاصيل الصرف اليومي حسب الصنف</h2><p style="font-size:12px;color:#64748b">عدد بنود الصرف: ${summary.lineCount} · عدد التصحيحات السالبة: ${summary.correctionCount}</p><div style="background:#fff;border-radius:14px;padding:10px;overflow:auto"><table style="width:100%;border-collapse:collapse;text-align:right;font-size:13px"><thead><tr style="background:#edf6f7"><th style="padding:12px">الكود</th><th style="padding:12px">الصنف</th><th style="padding:12px">الكمية الصافية</th><th style="padding:12px">القيمة الصافية</th></tr></thead><tbody>${disbursementRows}</tbody></table></div></section><p style="color:#8291a1;font-size:12px;margin-top:18px">تم إنشاء هذا التقرير تلقائياً بواسطة نظام Smart Inventory.</p></div></body></html>`;
}

export function buildDailyReportWhatsAppMessage(
  reportDate: string,
  minimumStockItems: InventoryReportRow[],
  thresholdPercentage: number,
  summary: DailyDisbursementSummary,
) {
  const severeLowStockCodes = new Set(getLowStockItems(minimumStockItems, thresholdPercentage).map(row => row.code));
  const unitTotals = summary.quantityByUnit.length
    ? summary.quantityByUnit.map(row => `${formatNumber(row.quantity)} ${row.unit}`).join("، ")
    : "لا يوجد صرف مسجل";
  const lowStockDetails = minimumStockItems.slice(0, 8).map(row => {
    const severe = severeLowStockCodes.has(row.code) ? "انخفاض حاد" : "عند الحد أو دونه";
    return `- ${row.name}: ${formatNumber(row.currentStock)} ${row.unit || "وحدة"} (الحد ${formatNumber(row.reorderLevel)}، ${severe})`;
  });
  if (minimumStockItems.length > 8) lowStockDetails.push(`- وأصناف أخرى: ${minimumStockItems.length - 8}`);
  return [
    `Smart Inventory — ملخص ${reportDate}`,
    `أصناف عند حد الطلب أو دونه: ${minimumStockItems.length}`,
    `انخفاض حاد (≤ ${formatNumber(thresholdPercentage)}% من حد الطلب): ${minimumStockItems.filter(row => severeLowStockCodes.has(row.code)).length}`,
    `أذونات الصرف: ${summary.permitCount}`,
    `صافي قيمة الصرف: ${formatNumber(summary.netValue)} ج.م`,
    `صافي الكميات حسب الوحدة: ${unitTotals}`,
    ...lowStockDetails,
  ].join("\n");
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
  const reportDate = new Date().toISOString().slice(0, 10);
  const dailyDisbursementRows = kind === "daily" ? await getDailyDisbursementRows(reportDate) : [];
  const dailySummary = summarizeDailyDisbursements(dailyDisbursementRows);
  const configuredLowStock = getLowStockItems(rows, thresholdPercentage);
  const lowStock = kind === "daily" ? getItemsAtOrBelowMinimum(rows) : configuredLowStock;
  if (kind === "low_stock" && lowStock.length === 0) {
    return { kind, lowStockCount: 0, sent: false, fallbackNotified: false, reason: "no-low-stock" };
  }

  const title = kind === "low_stock" ? "تنبيه أصناف تحتاج متابعة" : kind === "daily" ? "التقرير اليومي للمخزون" : "التقرير الأسبوعي للمخزون";
  const reportRows = kind === "low_stock" ? configuredLowStock : rows;
  const html = kind === "daily"
    ? buildDailyInventoryReportHtml(rows, thresholdPercentage, dailySummary, reportDate)
    : buildInventoryReportHtml(reportRows, thresholdPercentage, title);
  const recipients = configuredRecipients(recipientsRaw);
  let sent = false;
  let fallbackNotified = false;
  try {
    sent = await sendConfiguredEmail({ subject: `Smart Inventory — ${title}${kind === "daily" ? ` — ${reportDate}` : ""}`, html, recipients });
  } catch (error) {
    console.error("[Reports] SMTP send failed:", error);
  }
  if (!sent) {
    const content = kind === "daily"
      ? buildDailyReportWhatsAppMessage(reportDate, lowStock, thresholdPercentage, dailySummary)
      : `عدد الأصناف في التقرير: ${reportRows.length}. الأصناف التي تحتاج متابعة: ${configuredLowStock.length}. لم يتم إرسال البريد لأن إعدادات SMTP أو المستلمين غير مكتملة.`;
    fallbackNotified = await notifyOwner({ title, content });
  }

  const whatsappMessage = kind === "daily"
    ? buildDailyReportWhatsAppMessage(reportDate, lowStock, thresholdPercentage, dailySummary)
    : `📦 *Smart Inventory - ${title}*\n- إجمالي الأصناف: ${reportRows.length}\n- الأصناف التي تحتاج متابعة: ${configuredLowStock.length}\n- نسبة حد الطلب: ${thresholdPercentage}%`;
  await sendWhatsAppNotification(whatsappMessage);

  return {
    kind,
    lowStockCount: lowStock.length,
    severeLowStockCount: kind === "daily" ? lowStock.filter(row => getLowStockItems([row], thresholdPercentage).length > 0).length : configuredLowStock.length,
    sent,
    fallbackNotified,
    recipients: recipients.length,
    ...(kind === "daily" ? { reportDate, dailyDisbursementCount: dailySummary.permitCount, dailyDisbursementValue: dailySummary.netValue } : {}),
  };
}
