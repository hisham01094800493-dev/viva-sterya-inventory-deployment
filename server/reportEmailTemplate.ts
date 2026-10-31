/**
 * قالب بريد التقرير اليومي — تصميم موحّد ومنظّم.
 *
 * المبادئ:
 * - جدول واحد متماسك بدل تقريرين متراكبين.
 * - جداول HTML حقيقية (table layout) لأن Outlook لا يدعم flex/grid.
 * - padding واضح لكل خلية + فواصل صفوف + تظليل متبادل (zebra).
 * - أرقام في المنتصف، نصوص لليمين (RTL).
 * - متجاوب على الموبايل عبر media query + fallback.
 */

export type ReportEmailRow = {
  code: string;
  name: string;
  currentStock: string | number;
  reorderLevel: string | number;
  unit?: string | null;
};

export type ReportEmailForecast = {
  code: string;
  name: string;
  unit: string;
  currentStock: number;
  velocity: number;
  daysToExhaust: number;
};

export type ReportEmailBuilding = { name: string; quantity: number; value: number };

export type ReportEmailSummary = {
  permitCount: number;
  lineCount: number;
  correctionCount: number;
  netValue: number;
  quantityByUnit: Array<{ unit: string; quantity: number }>;
  items: Array<{ itemCode: string; itemName: string; unit: string; quantity: number; totalValue: number }>;
};

export type ReportEmailInput = {
  reportDate: string;
  thresholdPercentage: number;
  inventoryTotal: number;
  minimumStockItems: ReportEmailRow[];
  severeCodes: Set<string>;
  forecasts: ReportEmailForecast[];
  buildingAlerts: ReportEmailBuilding[];
  unassigned: number;
  totalTodayMovements: number;
  summary: ReportEmailSummary;
};

const BRAND = "#0d4f62";
const BRAND_DARK = "#0a3d4d";
const GOLD = "#f1c27d";
const INK = "#102a43";
const MUTED = "#64748b";
const LINE = "#e3ebf2";
const ZEBRA = "#f7fafc";

const CRITICAL = "#b42318";
const CRITICAL_BG = "#fef3f2";
const WARN = "#b54708";
const WARN_BG = "#fffaeb";
const OK = "#067647";
const OK_BG = "#ecfdf3";

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
}

function num(value: unknown, digits = 2) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
}

/** خلية رقمية: في المنتصف + أرقام لاتينية واضحة */
function cellNum(content: string, extra = "") {
  return `<td dir="ltr" align="center" style="padding:11px 12px;border-bottom:1px solid ${LINE};text-align:center;vertical-align:middle;font-size:13px;color:${INK};${extra}">${content}</td>`;
}

/** خلية نصية: لليمين */
function cellText(content: string, extra = "") {
  return `<td align="right" style="padding:11px 12px;border-bottom:1px solid ${LINE};text-align:right;vertical-align:middle;font-size:13px;color:${INK};word-break:break-word;${extra}">${content}</td>`;
}

function pill(label: string, color: string, bg: string) {
  return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${bg};color:${color};font-size:11px;font-weight:700;white-space:nowrap;border:1px solid ${color}33">${label}</span>`;
}

function sectionTitle(step: string, title: string, hint?: string) {
  return `<tr><td style="padding:26px 0 10px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="30" valign="top" style="padding-top:1px">
        <div style="width:24px;height:24px;border-radius:8px;background:${BRAND};color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:24px;font-family:Arial,sans-serif">${esc(step)}</div>
      </td>
      <td align="right" valign="top">
        <div style="font-size:16px;font-weight:700;color:${INK};line-height:1.5">${esc(title)}</div>
        ${hint ? `<div style="font-size:11.5px;color:${MUTED};margin-top:3px;line-height:1.6">${hint}</div>` : ""}
      </td>
    </tr></table>
  </td></tr>`;
}

function tableOpen(headers: string[], align: Array<"num" | "text">, headBg = BRAND) {
  const ths = headers
    .map((h, i) => `<th align="${align[i] === "num" ? "center" : "right"}" style="padding:11px 12px;background:${headBg};color:#ffffff;font-size:12px;font-weight:700;text-align:${align[i] === "num" ? "center" : "right"};white-space:nowrap;border-bottom:2px solid ${BRAND_DARK}">${esc(h)}</th>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid ${LINE};border-radius:10px;overflow:hidden">
    <thead><tr>${ths}</tr></thead><tbody>`;
}

function emptyRow(colspan: number, message: string, tone: "ok" | "muted" = "muted") {
  const color = tone === "ok" ? OK : MUTED;
  const bg = tone === "ok" ? OK_BG : "#ffffff";
  return `<tr><td colspan="${colspan}" align="center" style="padding:18px 12px;text-align:center;color:${color};background:${bg};font-size:13px">${esc(message)}</td></tr>`;
}

function kpiCard(label: string, value: string, accent: string, sub?: string) {
  return `<td class="kpi-cell" width="25%" valign="top" style="padding:0 5px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:12px;background:#ffffff">
      <tr><td style="height:4px;background:${accent};border-radius:12px 12px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td align="right" style="padding:13px 13px 4px;font-size:11.5px;color:${MUTED};line-height:1.5">${esc(label)}</td></tr>
      <tr><td align="right" style="padding:0 13px 12px;font-size:21px;font-weight:700;color:${accent};line-height:1.3" dir="ltr">${value}</td></tr>
      ${sub ? `<tr><td align="right" style="padding:0 13px 11px;font-size:10.5px;color:${MUTED}">${esc(sub)}</td></tr>` : ""}
    </table>
  </td>`;
}

export function buildDailyReportEmail(input: ReportEmailInput): string {
  const {
    reportDate,
    thresholdPercentage,
    inventoryTotal,
    minimumStockItems,
    severeCodes,
    forecasts,
    buildingAlerts,
    unassigned,
    totalTodayMovements,
    summary,
  } = input;

  const severeCount = minimumStockItems.filter(row => severeCodes.has(row.code)).length;
  const criticalForecasts = forecasts.filter(row => Number.isFinite(row.daysToExhaust) && row.daysToExhaust <= 7);
  const soonForecasts = forecasts.filter(row => Number.isFinite(row.daysToExhaust) && row.daysToExhaust > 7);

  // ---- ملخص سريع في سطر واحد ----
  const quickBits: string[] = [];
  quickBits.push(`أذون الصرف اليوم: <b style="color:${BRAND}">${num(summary.permitCount, 0)}</b> بقيمة <b style="color:${BRAND}">${money(summary.netValue)}</b> ج.م`);
  if (minimumStockItems.length) quickBits.push(`أصناف تحت حد الطلب: <b style="color:${WARN}">${num(minimumStockItems.length, 0)}</b>`);
  if (criticalForecasts.length) quickBits.push(`معرّضة للنفاذ خلال أسبوع: <b style="color:${CRITICAL}">${num(criticalForecasts.length, 0)}</b>`);
  if (!minimumStockItems.length && !criticalForecasts.length) quickBits.push(`المخزون <b style="color:${OK}">مستقر</b> بلا تنبيهات`);

  // ---- ١ أصناف تحت حد الطلب ----
  const stockRows = minimumStockItems.length
    ? minimumStockItems.map((row, index) => {
        const severe = severeCodes.has(row.code);
        const current = Number(row.currentStock ?? 0);
        const reorder = Number(row.reorderLevel ?? 0);
        const gap = Math.max(0, reorder - current);
        const unit = esc(row.unit || "وحدة");
        const bg = index % 2 === 1 ? ZEBRA : "#ffffff";
        const status = severe ? pill("انخفاض حاد", CRITICAL, CRITICAL_BG) : pill("عند الحد", WARN, WARN_BG);
        return `<tr style="background:${bg}">
          ${cellText(`<span dir="ltr" style="font-family:Consolas,Menlo,monospace;font-size:11.5px;color:${MUTED}">${esc(row.code)}</span>`)}
          ${cellText(`<b style="font-weight:700">${esc(row.name)}</b>`)}
          ${cellNum(`<b style="color:${severe ? CRITICAL : WARN}">${num(current)}</b> <span style="color:${MUTED};font-size:11px">${unit}</span>`)}
          ${cellNum(`${num(reorder)} <span style="color:${MUTED};font-size:11px">${unit}</span>`)}
          ${cellNum(gap > 0 ? `<b style="color:${CRITICAL}">${num(gap)}</b>` : `<span style="color:${MUTED}">—</span>`)}
          ${cellNum(status)}
        </tr>`;
      }).join("")
    : emptyRow(6, "لا توجد أصناف عند حد الطلب أو دونه — المخزون ضمن الحدود الآمنة.", "ok");

  // ---- ٢ توقعات النفاذ ----
  const forecastRows = forecasts.length
    ? forecasts.slice(0, 10).map((row, index) => {
        const days = row.daysToExhaust;
        const critical = days <= 7;
        const bg = index % 2 === 1 ? ZEBRA : "#ffffff";
        const unit = esc(row.unit || "وحدة");
        const suggested = row.velocity > 0 ? Math.max(0, Math.ceil(row.velocity * 14 - row.currentStock)) : 0;
        return `<tr style="background:${bg}">
          ${cellText(`<span dir="ltr" style="font-family:Consolas,Menlo,monospace;font-size:11.5px;color:${MUTED}">${esc(row.code)}</span>`)}
          ${cellText(`<b style="font-weight:700">${esc(row.name)}</b>`)}
          ${cellNum(`${num(row.currentStock)} <span style="color:${MUTED};font-size:11px">${unit}</span>`)}
          ${cellNum(`${num(row.velocity, 3)}`)}
          ${cellNum(`<b style="color:${critical ? CRITICAL : WARN}">${num(days, 1)}</b> <span style="color:${MUTED};font-size:11px">يوم</span>`)}
          ${cellNum(suggested > 0 ? `${num(suggested)} <span style="color:${MUTED};font-size:11px">${unit}</span>` : `<span style="color:${MUTED}">—</span>`)}
        </tr>`;
      }).join("")
    : emptyRow(6, "لا توجد أصناف متوقع نفاذها خلال 30 يومًا وفق بيانات آخر 14 يومًا.", "ok");

  // ---- ٣ كميات الصرف حسب الوحدة ----
  const unitRows = summary.quantityByUnit.length
    ? summary.quantityByUnit.map((row, index) => {
        const bg = index % 2 === 1 ? ZEBRA : "#ffffff";
        return `<tr style="background:${bg}">${cellText(`<b>${esc(row.unit)}</b>`)}${cellNum(`<b style="color:${BRAND}">${num(row.quantity)}</b>`)}</tr>`;
      }).join("")
    : emptyRow(2, "لا توجد أذونات صرف مسجّلة اليوم.");

  // ---- ٤ تفاصيل الصرف حسب الصنف ----
  const itemRows = summary.items.length
    ? summary.items.slice(0, 15).map((row, index) => {
        const bg = index % 2 === 1 ? ZEBRA : "#ffffff";
        return `<tr style="background:${bg}">
          ${cellText(`<span dir="ltr" style="font-family:Consolas,Menlo,monospace;font-size:11.5px;color:${MUTED}">${esc(row.itemCode)}</span>`)}
          ${cellText(`<b style="font-weight:700">${esc(row.itemName)}</b>`)}
          ${cellNum(`${num(row.quantity)} <span style="color:${MUTED};font-size:11px">${esc(row.unit)}</span>`)}
          ${cellNum(`${money(row.totalValue)} <span style="color:${MUTED};font-size:11px">ج.م</span>`)}
        </tr>`;
      }).join("")
    : emptyRow(4, "لا توجد تفاصيل صرف لهذا اليوم.");

  // ---- ٥ تنبيهات المباني ----
  const buildingRows = buildingAlerts.length
    ? buildingAlerts.map((row, index) => {
        const bg = index % 2 === 1 ? ZEBRA : "#ffffff";
        return `<tr style="background:${bg}">
          ${cellText(`<b>${esc(row.name)}</b>`)}
          ${cellNum(`${num(row.quantity)}`)}
          ${cellNum(`<b style="color:${BRAND}">${money(row.value)}</b> <span style="color:${MUTED};font-size:11px">ج.م</span>`)}
        </tr>`;
      }).join("")
    : emptyRow(3, "لا توجد حركات صرف مرتبطة بمبانٍ اليوم.", "ok");

  const unassignedBlock = unassigned > 0
    ? `<tr><td style="padding:12px 0 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CRITICAL_BG};border:1px solid ${CRITICAL}33;border-radius:10px">
          <tr><td align="right" style="padding:12px 14px;font-size:12.5px;color:${CRITICAL};font-weight:700">⚠ يوجد ${num(unassigned, 0)} حركة صرف اليوم بدون مبنى مرتبط — يُنصح بمراجعتها.</td></tr>
        </table>
      </td></tr>`
    : "";

  const moreStockNote = minimumStockItems.length > 0
    ? `<tr><td align="right" style="padding:9px 2px 0;font-size:11px;color:${MUTED}">عدد الأصناف المعروضة: ${num(minimumStockItems.length, 0)} من إجمالي ${num(inventoryTotal, 0)} صنف.</td></tr>`
    : "";

  const moreForecastNote = forecasts.length > 10
    ? `<tr><td align="right" style="padding:9px 2px 0;font-size:11px;color:${MUTED}">يظهر أول 10 أصناف فقط — الإجمالي ${num(forecasts.length, 0)} صنف.</td></tr>`
    : "";

  const moreItemsNote = summary.items.length > 15
    ? `<tr><td align="right" style="padding:9px 2px 0;font-size:11px;color:${MUTED}">يظهر أعلى 15 صنفًا بالقيمة — الإجمالي ${num(summary.items.length, 0)} صنف.</td></tr>`
    : "";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>التقرير اليومي للمخزون — ${esc(reportDate)}</title>
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
  body{margin:0!important;padding:0!important;width:100%!important}
  @media screen and (max-width:620px){
    .wrap{max-width:100%!important;border-radius:12px!important}
    .kpi-cell{display:block!important;width:100%!important;padding:0 0 8px!important}
    .h1{font-size:19px!important;line-height:1.45!important}
    .hdr{padding:18px 16px 16px!important}
    .pad{padding:0 16px 20px!important}
    .col-half{display:block!important;width:100%!important;padding:0 0 10px!important}
    .tbl-scroll{display:block!important;width:100%!important;max-width:100%!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch!important}
    .tbl-scroll table{min-width:0!important;width:100%!important;font-size:11px!important}
    .tbl-scroll th,.tbl-scroll td{padding:9px 6px!important;word-break:break-word!important}
    .foot{font-size:10.5px!important}
    .foot-cell{display:block!important;width:100%!important;text-align:right!important;padding-top:6px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#eef3f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:${INK}">
<div style="display:none;font-size:1px;color:#eef3f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">التقرير اليومي ${esc(reportDate)} — ${num(summary.permitCount, 0)} إذن صرف بقيمة ${money(summary.netValue)} ج.م</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3f8;width:100%">
<tr><td align="center" style="padding:22px 12px">
<table role="presentation" class="wrap" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:660px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(16,42,67,.08)">

  <!-- ===== الهيدر ===== -->
  <tr><td style="background:${BRAND};padding:0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="hdr" style="padding:24px 24px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="right" valign="middle">
            <div style="font-size:10px;letter-spacing:3px;color:${GOLD};font-weight:700">SMART&nbsp;INVENTORY</div>
            <div class="h1" style="font-size:23px;font-weight:700;color:#ffffff;margin-top:8px;line-height:1.4">التقرير اليومي للمخزون</div>
          </td>
          <td align="left" valign="middle" width="110">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,.12);border-radius:10px">
              <tr><td align="center" style="padding:9px 12px">
                <div style="font-size:9.5px;color:#cfe6ec;letter-spacing:1px">التاريخ</div>
                <div dir="ltr" style="font-size:13px;color:#ffffff;font-weight:700;margin-top:2px">${esc(reportDate)}</div>
              </td></tr>
            </table>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- ===== ملخص سريع ===== -->
  <tr><td style="padding:16px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f9fb;border:1px solid #d9e8ee;border-radius:12px">
      <tr><td align="right" style="padding:13px 15px;font-size:12.5px;line-height:1.85;color:#334e68">
        ${quickBits.join(" &nbsp;·&nbsp; ")}.
      </td></tr>
    </table>
  </td></tr>

  <!-- ===== KPI ===== -->
  <tr><td style="padding:16px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      ${kpiCard("أذون الصرف اليوم", num(summary.permitCount, 0), BRAND, `${num(summary.lineCount, 0)} بند صرف`)}
      ${kpiCard("صافي قيمة الصرف", money(summary.netValue), "#0f766e", "بالجنيه المصري")}
      ${kpiCard("أصناف عند الحد الأدنى", num(minimumStockItems.length, 0), WARN, severeCount ? `منها ${num(severeCount, 0)} انخفاض حاد` : "لا يوجد انخفاض حاد")}
      ${kpiCard("نفاذ متوقع ≤ 7 أيام", num(criticalForecasts.length, 0), CRITICAL, soonForecasts.length ? `+${num(soonForecasts.length, 0)} خلال 30 يومًا` : "لا توجد حالات أخرى")}
    </tr></table>
  </td></tr>

  <tr><td class="pad" style="padding:0 24px 26px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

    ${sectionTitle("١", "أصناف عند حد الطلب أو دونه", `حد التنبيه الحالي: ${num(thresholdPercentage, 0)}% من حد إعادة الطلب · انخفاض حاد = عند أو تحت هذا الحد`)}
    <tr><td>
      <div class="tbl-scroll">
        ${tableOpen(["الكود", "الصنف", "الرصيد الحالي", "حد الطلب", "النقص", "الحالة"], ["text", "text", "num", "num", "num", "num"])}
        ${stockRows}
        </tbody></table>
      </div>
    </td></tr>
    ${moreStockNote}

    ${sectionTitle("٢", "توقعات النفاذ", "مبنية على معدل الصرف الفعلي خلال آخر 14 يومًا · الطلب المقترح يغطي 14 يومًا")}
    <tr><td>
      <div class="tbl-scroll">
        ${tableOpen(["الكود", "الصنف", "الرصيد", "معدل/يوم", "يكفي", "طلب مقترح"], ["text", "text", "num", "num", "num", "num"])}
        ${forecastRows}
        </tbody></table>
      </div>
    </td></tr>
    ${moreForecastNote}

    ${sectionTitle("٣", "حركة الصرف اليوم", `عدد البنود: ${num(summary.lineCount, 0)} · التصحيحات السالبة: ${num(summary.correctionCount, 0)} · الكميات مجمّعة لكل وحدة على حدة`)}
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="col-half" width="38%" valign="top" style="padding-left:10px">
          ${tableOpen(["الوحدة", "صافي الكمية"], ["text", "num"])}
          ${unitRows}
          </tbody></table>
        </td>
        <td class="col-half" width="62%" valign="top">
          <div class="tbl-scroll">
            ${tableOpen(["الكود", "الصنف", "الكمية", "القيمة"], ["text", "text", "num", "num"])}
            ${itemRows}
            </tbody></table>
          </div>
        </td>
      </tr></table>
    </td></tr>
    ${moreItemsNote}

    ${sectionTitle("٤", "تنبيهات المباني", "إجمالي الصرف اليوم لكل مبنى نشط")}
    <tr><td>
      ${tableOpen(["المبنى", "الكمية", "القيمة"], ["text", "num", "num"])}
      ${buildingRows}
      </tbody></table>
    </td></tr>
    ${unassignedBlock}

  </table>
  </td></tr>

  <!-- ===== الفوتر ===== -->
  <tr><td style="background:#f4f7fb;border-top:1px solid ${LINE};padding:16px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="right" class="foot foot-cell" style="font-size:11px;color:${MUTED};line-height:1.7">
        تم إنشاء هذا التقرير تلقائيًا بواسطة نظام <b style="color:${BRAND}">Smart Inventory</b> · ${esc(reportDate)}
      </td>
      <td align="left" class="foot foot-cell" style="font-size:11px;color:${MUTED};white-space:nowrap">
        ${num(inventoryTotal, 0)} صنف
      </td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
