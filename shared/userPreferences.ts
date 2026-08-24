export const DEFAULT_QUICK_ACTIONS = ["/additions", "/disbursements", "/transfers"] as const;

export function normalizeQuickActions(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_QUICK_ACTIONS];
  const allowed = new Set(DEFAULT_QUICK_ACTIONS);
  const normalized = value.filter((item): item is string => typeof item === "string" && allowed.has(item as (typeof DEFAULT_QUICK_ACTIONS)[number]));
  return normalized.length ? Array.from(new Set(normalized)) : [...DEFAULT_QUICK_ACTIONS];
}

export function parseQuickActions(value: string | null | undefined): string[] {
  try {
    return normalizeQuickActions(JSON.parse(value ?? "null"));
  } catch {
    return [...DEFAULT_QUICK_ACTIONS];
  }
}

export type ReportColumnOrder = Record<string, string[]>;

export function normalizeReportColumnOrder(value: unknown): ReportColumnOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, columns]) => Array.isArray(columns) && columns.every(column => typeof column === "string" && column.trim().length > 0)).map(([key, columns]) => [key, Array.from(new Set((columns as string[]).map(column => column.trim())))]));
}
