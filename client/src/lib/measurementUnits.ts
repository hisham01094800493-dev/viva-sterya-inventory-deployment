const UNIT_ALIASES: Record<string, string> = {
  م2: "م²",
  م٢: "م²",
  "م²": "م²",
  مترمربع: "م²",
  "متر²": "م²",
  م3: "م³",
  م٣: "م³",
  "م³": "م³",
  مترمكعب: "م³",
  "متر³": "م³",
  م: "م",
  متر: "م",
  مترطولي: "م",
};

export function normalizeMeasurementUnit(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const compact = raw.toLowerCase().replace(/[\s\u200e\u200f]/g, "");
  return UNIT_ALIASES[compact] ?? raw;
}

export function collectMeasurementUnits(items: Array<{ unit?: string | null }> = []) {
  return Array.from(new Set(items.map(item => normalizeMeasurementUnit(item.unit)).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, "ar"));
}

export function findMeasurementUnit(items: Array<{ unit?: string | null }>, value: unknown) {
  const normalized = normalizeMeasurementUnit(value);
  if (!normalized) return "";
  return items.find(item => normalizeMeasurementUnit(item.unit) === normalized)?.unit?.trim() || normalized;
}
