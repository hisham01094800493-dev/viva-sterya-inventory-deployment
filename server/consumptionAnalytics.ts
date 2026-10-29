export type ConsumptionHistoryRow = {
  buildingId?: number | null;
  itemCode?: string | null;
  quantity?: unknown;
  date?: string | null;
};

export type ConsumptionBaseline = {
  totalQuantity: number;
  dailyAverage: number;
  weeklyAverage: number;
  activeDays: number;
  movementCount: number;
  fromDate: string | null;
  toDate: string | null;
};

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function absoluteQuantity(value: unknown) {
  return Math.abs(Number(value ?? 0));
}

function calendarDays(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 1;
  return Math.max(1, Math.floor((to - from) / 86_400_000) + 1);
}

export function calculateConsumptionBaseline(
  rows: ConsumptionHistoryRow[],
  buildingId: number | null | undefined,
  itemCode: string,
  throughDate?: string,
): ConsumptionBaseline {
  const matching = rows
    .filter(row => (row.buildingId ?? null) === (buildingId ?? null))
    .filter(row => String(row.itemCode ?? "").trim() === itemCode)
    .filter(row => !throughDate || dateOnly(row.date) < throughDate)
    .filter(row => dateOnly(row.date));
  if (!matching.length) {
    return { totalQuantity: 0, dailyAverage: 0, weeklyAverage: 0, activeDays: 0, movementCount: 0, fromDate: null, toDate: null };
  }
  const dates = matching.map(row => dateOnly(row.date)).sort();
  const totalQuantity = matching.reduce((sum, row) => sum + absoluteQuantity(row.quantity), 0);
  const activeDays = calendarDays(dates[0], dates[dates.length - 1]);
  const dailyAverage = totalQuantity / activeDays;
  return {
    totalQuantity,
    dailyAverage,
    weeklyAverage: dailyAverage * 7,
    activeDays,
    movementCount: matching.length,
    fromDate: dates[0],
    toDate: dates[dates.length - 1],
  };
}

export function isConsumptionAnomaly(quantity: unknown, dailyAverage: number) {
  return dailyAverage > 0 && absoluteQuantity(quantity) > dailyAverage * 2;
}
