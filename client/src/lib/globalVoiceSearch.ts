import { normalizeVoiceSearchText } from "@/components/VoiceInputButton";

export type GlobalVoiceSearchIntent = "all" | "item" | "item-card" | "supplier" | "supplier-statement" | "supplier-report" | "customer" | "customer-statement" | "customer-report" | "additions" | "disbursements" | "transfers";
export type VoiceReportPeriod = { from: string; to: string; label: string };

const arabicDigitMap: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const monthAliases: Array<{ aliases: string[]; month: number; label: string }> = [
  { aliases: ["يناير"], month: 1, label: "يناير" }, { aliases: ["فبراير"], month: 2, label: "فبراير" }, { aliases: ["مارس"], month: 3, label: "مارس" }, { aliases: ["ابريل", "أبريل"], month: 4, label: "أبريل" },
  { aliases: ["مايو"], month: 5, label: "مايو" }, { aliases: ["يونيو"], month: 6, label: "يونيو" }, { aliases: ["يوليو"], month: 7, label: "يوليو" }, { aliases: ["اغسطس", "أغسطس"], month: 8, label: "أغسطس" },
  { aliases: ["سبتمبر"], month: 9, label: "سبتمبر" }, { aliases: ["اكتوبر", "أكتوبر"], month: 10, label: "أكتوبر" }, { aliases: ["نوفمبر"], month: 11, label: "نوفمبر" }, { aliases: ["ديسمبر"], month: 12, label: "ديسمبر" },
];

const intentRules: Array<[GlobalVoiceSearchIntent, RegExp]> = [
  ["supplier-report", /(تقرير|مبيعات|مشتريات|توريد).*(مورد|المورد)|(مورد|المورد).*(تقرير|مبيعات|مشتريات|توريد)/],
  ["customer-report", /(تقرير|مبيعات|صرف).*(عميل|العميل|جهه|الجهه|جهة|الجهة)|(عميل|العميل|جهه|الجهه|جهة|الجهة).*(تقرير|مبيعات|صرف)/],
  ["supplier-statement", /(كشف|حساب).*(مورد|المورد)|(مورد|المورد).*(كشف|حساب)/],
  ["customer-statement", /(كشف|حساب).*(عميل|العميل|جهه|الجهه|جهة|الجهة)|(عميل|العميل|جهه|الجهه|جهة|الجهة).*(كشف|حساب)/],
  ["item-card", /(كارت|بطاقه|بطاقة).*(صنف|الصنف|حركه|حركة)|(صنف|الصنف).*(كارت|بطاقه|بطاقة|حركه|حركة)/],
  ["additions", /(اضافه|إضافة|اضافات|إضافات|اذن اضافه|إذن إضافة|وارد)/],
  ["disbursements", /(صرف|اذن صرف|إذن صرف|جهات الصرف|جهه صرف|جهة صرف)/],
  ["transfers", /(تحويل|تحويلات|مرتجع|مرتجعات|ارتجاع|ارتجاعات)/],
  ["supplier", /(مورد|المورد|موردين|الموردين)/],
  ["customer", /(عميل|العميل|عملاء|العملاء|جهه|الجهه|جهة|الجهة)/],
  ["item", /(صنف|الصنف|اصناف|أصناف|مخزون|المخزون|كود)/],
];

const removableWords = /(افتح لي|افتحلي|افتح|اعرض|اظهر|أظهر|ابحث|دور|هات|عايز|اريد|أريد|من فضلك|لو سمحت|الموردين|المورد|موردين|مورد|العملاء|العميل|عملاء|عميل|الجهات|الجهة|جهات|جهة|كشف الحساب|كشف|حساب|كارت|بطاقه|بطاقة|حركه|حركة|الأصناف|الصنف|اصناف|أصناف|صنف|أذونات|اذونات|اذن|إذن|الإضافات|الاضافات|إضافات|اضافات|إضافة|اضافه|الصرف|صرف|التحويلات|تحويلات|تحويل|المرتجعات|مرتجعات|مرتجع|وارد|عن|على|في|فى|كل)/gi;
const reportStopWords = new Set(["اعرض", "افتح", "تقرير", "مبيعات", "المبيعات", "مشتريات", "المشتريات", "توريد", "التوريدات", "مورد", "المورد", "للمورد", "عميل", "العميل", "للعميل", "جهة", "الجهة", "للجهة", "صرف", "حركات", "حركة", "عن", "في", "فى", "لشهر", "شهر", "من", "الى", "الي", "هذا", "الشهر", "الماضي"]);

export function simplifyArabicForSearch(value: string) {
  return normalizeVoiceSearchText(value).toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ًٌٍَُِّْـ]/g, "");
}

function normalizeArabicDigits(value: string) {
  return value.replace(/[٠-٩]/g, digit => arabicDigitMap[digit] ?? digit);
}

export function normalizePermitNumber(value: string) {
  return normalizeArabicDigits(value).replace(/[^a-zA-Z0-9_-]/g, "").trim();
}

export function extractPermitNumber(value: string) {
  const match = value.match(/(?:رقم(?:\s+الاذن|\s+الإذن)?|برقم|اذن\s+رقم|إذن\s+رقم)\s*([٠-٩0-9A-Za-z_-]+)/i);
  return match ? normalizePermitNumber(match[1]) || undefined : undefined;
}

function toDateKey(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return undefined;
  return date.toISOString().slice(0, 10);
}

function getMonthByAlias(value: string) {
  return monthAliases.find(entry => entry.aliases.some(alias => simplifyArabicForSearch(alias) === simplifyArabicForSearch(value)));
}

function parseReportDate(value: string, fallbackYear: number) {
  const normalized = normalizeArabicDigits(simplifyArabicForSearch(value)).trim();
  const iso = normalized.match(/^(20\d{2})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (iso) return toDateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/);
  if (numeric) return toDateKey(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  const named = normalized.match(/^(?:يوم\s+)?(\d{1,2})\s+([^\s]+)(?:\s+(20\d{2}))?$/);
  if (!named) return undefined;
  const month = getMonthByAlias(named[2]);
  return month ? toDateKey(Number(named[3] ?? fallbackYear), month.month, Number(named[1])) : undefined;
}

function makeMonthPeriod(month: number, year: number, label: string): VoiceReportPeriod {
  return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10), label: `${label} ${year}` };
}

export function extractReportPeriod(value: string, referenceDate = new Date()): VoiceReportPeriod | undefined {
  const normalized = normalizeArabicDigits(simplifyArabicForSearch(value));
  const fallbackYear = referenceDate.getFullYear();
  const monthNames = monthAliases.flatMap(entry => entry.aliases).map(name => simplifyArabicForSearch(name)).join("|");
  const dateExpression = `(?:\\d{1,2}\\s+(?:${monthNames})(?:\\s+20\\d{2})?|20\\d{2}[/-]\\d{1,2}[/-]\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-]20\\d{2})`;
  const range = normalized.match(new RegExp(`من\\s+(${dateExpression})\\s+(?:الى|الي)\\s+(${dateExpression})`, "i"));
  if (range) {
    const from = parseReportDate(range[1], fallbackYear);
    const to = parseReportDate(range[2], fallbackYear);
    if (from && to && from <= to) return { from, to, label: `من ${from} إلى ${to}` };
  }
  if (normalized.includes("هذا الشهر")) return makeMonthPeriod(referenceDate.getMonth() + 1, referenceDate.getFullYear(), "هذا الشهر");
  if (normalized.includes("الشهر الماضي")) {
    const previous = new Date(Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1));
    return makeMonthPeriod(previous.getUTCMonth() + 1, previous.getUTCFullYear(), "الشهر الماضي");
  }
  const matchedMonth = monthAliases.find(entry => entry.aliases.some(alias => normalized.includes(simplifyArabicForSearch(alias))));
  if (!matchedMonth) return undefined;
  const yearMatch = normalized.match(/(?:^|\s)(20\d{2})(?:\s|$)/);
  return makeMonthPeriod(matchedMonth.month, yearMatch ? Number(yearMatch[1]) : fallbackYear, matchedMonth.label);
}

function extractReportPartyTerms(value: string) {
  return normalizeArabicDigits(simplifyArabicForSearch(value)).split(/\s+/).filter(token => token && !reportStopWords.has(token) && !monthAliases.some(entry => entry.aliases.some(alias => simplifyArabicForSearch(alias) === token)) && !/^20\d{2}$/.test(token) && !/^\d{1,2}([/-]\d{1,2})?([/-]20\d{2})?$/.test(token)).join(" ").trim();
}

export function parseGlobalVoiceSearch(raw: string, referenceDate = new Date()) {
  const spokenText = normalizeVoiceSearchText(raw);
  const normalized = simplifyArabicForSearch(spokenText);
  const intent = intentRules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "all";
  const permitNumber = extractPermitNumber(spokenText);
  const isReport = intent === "supplier-report" || intent === "customer-report";
  const period = isReport ? extractReportPeriod(spokenText, referenceDate) : undefined;
  const terms = spokenText.replace(removableWords, " ").replace(/\s+/g, " ").trim();
  const reportPartyTerms = isReport ? extractReportPartyTerms(spokenText) : undefined;
  return { raw: spokenText, normalized, intent, terms: permitNumber || reportPartyTerms || terms || spokenText, permitNumber, period };
}

export function getGlobalSearchRoute(intent: GlobalVoiceSearchIntent, terms: string, id?: number, permitNumber?: string, period?: VoiceReportPeriod) {
  const query = encodeURIComponent(terms);
  if (intent === "item" || intent === "item-card") return id ? `/items?card=${id}` : `/items?search=${query}`;
  if (intent === "supplier" || intent === "supplier-statement") return id ? `/suppliers/${id}/statement` : `/suppliers`;
  if (intent === "supplier-report") return `/reports?type=movements&incomingFrom=${query}&movement=إضافة${period ? `&from=${period.from}&to=${period.to}` : ""}`;
  if (intent === "customer" || intent === "customer-statement") return id ? `/customers/${id}/statement` : `/customers`;
  if (intent === "customer-report") return `/reports?type=movements&outgoingTo=${query}&movement=صرف${period ? `&from=${period.from}&to=${period.to}` : ""}`;
  const movementQuery = permitNumber ? `permit=${encodeURIComponent(permitNumber)}` : `search=${query}`;
  if (intent === "additions") return `/additions?${movementQuery}`;
  if (intent === "disbursements") return `/disbursements?${movementQuery}`;
  if (intent === "transfers") return `/transfers?${movementQuery}`;
  return `/items?search=${query}`;
}
