import { normalizeVoiceSearchText } from "@/components/VoiceInputButton";

export type GlobalVoiceSearchIntent = "all" | "item" | "item-card" | "supplier" | "supplier-statement" | "supplier-report" | "customer" | "customer-statement" | "additions" | "disbursements" | "transfers";

const arabicDigitMap: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };

const intentRules: Array<[GlobalVoiceSearchIntent, RegExp]> = [
  ["supplier-report", /(تقرير|مبيعات|مشتريات|توريد).*(مورد|المورد)|(مورد|المورد).*(تقرير|مبيعات|مشتريات|توريد)/],
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
const monthNumbers: Array<[string, number]> = [["يناير", 1], ["فبراير", 2], ["مارس", 3], ["ابريل", 4], ["أبريل", 4], ["مايو", 5], ["يونيو", 6], ["يوليو", 7], ["اغسطس", 8], ["أغسطس", 8], ["سبتمبر", 9], ["اكتوبر", 10], ["أكتوبر", 10], ["نوفمبر", 11], ["ديسمبر", 12]];

export function simplifyArabicForSearch(value: string) {
  return normalizeVoiceSearchText(value).toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ًٌٍَُِّْـ]/g, "");
}

export function normalizePermitNumber(value: string) {
  return value.replace(/[٠-٩]/g, digit => arabicDigitMap[digit] ?? digit).replace(/[^a-zA-Z0-9_-]/g, "").trim();
}

export function extractPermitNumber(value: string) {
  const match = value.match(/(?:رقم(?:\s+الاذن|\s+الإذن)?|برقم|اذن\s+رقم|إذن\s+رقم)\s*([٠-٩0-9A-Za-z_-]+)/i);
  return match ? normalizePermitNumber(match[1]) || undefined : undefined;
}

export function extractReportPeriod(value: string, referenceDate = new Date()) {
  const normalized = simplifyArabicForSearch(value);
  const matchedMonth = monthNumbers.find(([name]) => normalized.includes(simplifyArabicForSearch(name)));
  if (!matchedMonth) return undefined;
  const [, month] = matchedMonth;
  const yearMatch = normalized.match(/(?:^|\s)(20\d{2})(?:\s|$)/);
  const year = yearMatch ? Number(yearMatch[1]) : referenceDate.getFullYear();
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = new Date(year, month, 0).toISOString().slice(0, 10);
  return { from, to, label: `${matchedMonth[0]} ${year}` };
}

function extractReportPartyTerms(value: string) {
  const months = monthNumbers.map(([name]) => name).join("|");
  return value.replace(new RegExp(`(اعرض|افتح|تقرير|مبيعات|مشتريات|توريد|للمورد|المورد|مورد|عن|في|فى|لشهر|شهر|${months}|20\\d{2})`, "gi"), " ").replace(/\s+/g, " ").trim();
}

export function parseGlobalVoiceSearch(raw: string) {
  const spokenText = normalizeVoiceSearchText(raw);
  const normalized = simplifyArabicForSearch(spokenText);
  const intent = intentRules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "all";
  const permitNumber = extractPermitNumber(spokenText);
  const period = intent === "supplier-report" ? extractReportPeriod(spokenText) : undefined;
  const terms = spokenText.replace(removableWords, " ").replace(/\s+/g, " ").trim();
  const reportPartyTerms = intent === "supplier-report" ? extractReportPartyTerms(spokenText) : undefined;
  return { raw: spokenText, normalized, intent, terms: permitNumber || reportPartyTerms || terms || spokenText, permitNumber, period };
}

export function getGlobalSearchRoute(intent: GlobalVoiceSearchIntent, terms: string, id?: number, permitNumber?: string, period?: { from: string; to: string }) {
  const query = encodeURIComponent(terms);
  if (intent === "item" || intent === "item-card") return id ? `/items?card=${id}` : `/items?search=${query}`;
  if (intent === "supplier" || intent === "supplier-statement") return id ? `/suppliers/${id}/statement` : `/suppliers`;
  if (intent === "supplier-report") return `/reports?type=movements&incomingFrom=${query}&movement=إضافة${period ? `&from=${period.from}&to=${period.to}` : ""}`;
  if (intent === "customer" || intent === "customer-statement") return id ? `/customers/${id}/statement` : `/customers`;
  const movementQuery = permitNumber ? `permit=${encodeURIComponent(permitNumber)}` : `search=${query}`;
  if (intent === "additions") return `/additions?${movementQuery}`;
  if (intent === "disbursements") return `/disbursements?${movementQuery}`;
  if (intent === "transfers") return `/transfers?${movementQuery}`;
  return `/items?search=${query}`;
}
