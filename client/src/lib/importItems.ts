type XlsxModule = typeof import("xlsx");
let xlsxModulePromise: Promise<XlsxModule> | null = null;
const loadXlsx = () => xlsxModulePromise ??= import("xlsx");

export type ImportRow = {
  code: string;
  name: string;
  initialStock: number;
  reorderLevel: number;
  category: string | null;
  unit: string | null;
  unitPrice: number;
};

export type ImportParseResult = {
  rows: ImportRow[];
  rejected: number;
  issues: string[];
  sheetName: string;
};

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه");

const parseNumber = (value: unknown) => {
  const normalized = String(value ?? "0")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[٬,]/g, "")
    .replace("٫", ".")
    .trim();
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
};

const getCell = (row: Record<string, unknown>, labels: string[]) => {
  const normalizedLabels = labels.map(normalizeHeader);
  const found = Object.entries(row).find(([key]) => normalizedLabels.includes(normalizeHeader(key)));
  return found?.[1] ?? "";
};

export async function parseItemsWorkbook(data: ArrayBuffer): Promise<ImportParseResult> {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("لم يتم العثور على ورقة عمل داخل الملف");

  const firstSheet = workbook.Sheets[sheetName];
  const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  const rows: ImportRow[] = [];
  const issues: string[] = [];
  const seenCodes = new Set<string>();
  let rejected = 0;

  source.forEach((row, index) => {
    const code = String(getCell(row, ["code", "كود الصنف", "كود", "item code"])).trim();
    const name = String(getCell(row, ["name", "اسم الصنف", "بيان الصنف", "الاسم"])).trim();
    if (!code || !name) {
      rejected += 1;
      issues.push(`الصف ${index + 2}: ${!code ? "كود الصنف مفقود" : "اسم الصنف مفقود"}`);
      return;
    }
    if (seenCodes.has(code)) issues.push(`الصف ${index + 2}: الكود ${code} مكرر داخل الملف وسيتم تحديث السجل الموجود`);
    seenCodes.add(code);
    rows.push({
      code,
      name,
      initialStock: parseNumber(getCell(row, ["initialstock", "initial stock", "الرصيد الأولي", "رصيد الجرد", "الرصيد"])),
      reorderLevel: parseNumber(getCell(row, ["reorderlevel", "reorder level", "حد الطلب", "حد إعادة الطلب"])),
      category: String(getCell(row, ["category", "نوع الصنف", "التصنيف"])).trim() || null,
      unit: String(getCell(row, ["unit", "الوحدة", "وحدة القياس"])).trim() || null,
      unitPrice: parseNumber(getCell(row, ["unitprice", "unit price", "سعر الوحدة", "السعر", "price"])),
    });
  });

  return { rows, rejected, issues, sheetName };
}

export function isSupportedItemsFile(fileName: string) {
  return /\.(xlsx|xls|xlsb|csv)$/i.test(fileName);
}
