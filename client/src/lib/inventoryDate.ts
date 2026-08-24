const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

function formatUtcDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function isoFromUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Normalizes stored dates and Excel serial dates to YYYY-MM-DD for filtering and sorting. */
export function inventoryDateKey(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return isoFromUtcDate(value);

  const raw = String(value).trim();
  if (!raw) return "";
  const normalized = raw.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٬,]/g, "").replace("٫", ".");
  const dayOnly = normalized.match(/^(\d{1,2})$/);
  if (dayOnly && Number(dayOnly[1]) >= 1 && Number(dayOnly[1]) <= 31) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(Number(dayOnly[1])).padStart(2, "0")}`;
  }
  const compactYearFirst = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactYearFirst && Number(compactYearFirst[2]) >= 1 && Number(compactYearFirst[2]) <= 12 && Number(compactYearFirst[3]) >= 1 && Number(compactYearFirst[3]) <= 31) return `${compactYearFirst[1]}-${compactYearFirst[2]}-${compactYearFirst[3]}`;
  const compactDayFirst = normalized.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compactDayFirst && Number(compactDayFirst[1]) >= 1 && Number(compactDayFirst[1]) <= 31 && Number(compactDayFirst[2]) >= 1 && Number(compactDayFirst[2]) <= 12) return `${compactDayFirst[3]}-${compactDayFirst[2]}-${compactDayFirst[1]}`;
  const compactDayMonth = normalized.match(/^(\d{2})(\d{2})$/);
  if (compactDayMonth) {
    const day = Number(compactDayMonth[1]);
    const month = Number(compactDayMonth[2]);
    const year = new Date().getUTCFullYear();
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric < 200000) return isoFromUtcDate(new Date(EXCEL_EPOCH_UTC + numeric * DAY_MS));

  const isoDate = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2].padStart(2, "0")}-${isoDate[3].padStart(2, "0")}`;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : isoFromUtcDate(parsed);
}

/** Displays stored dates and Excel serial dates consistently as DD/MM/YYYY. */
export function formatInventoryDate(value: unknown) {
  const key = inventoryDateKey(value);
  if (!key) return "—";
  const parsed = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? String(value) : formatUtcDate(parsed);
}
