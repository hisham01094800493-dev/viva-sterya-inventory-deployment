export type StockVarianceItem = {
  code: string;
  name: string;
  initialStock?: number | string | null;
  incomingStock?: number | string | null;
  outgoingStock?: number | string | null;
  currentStock?: number | string | null;
  unitPrice?: number | string | null;
  warehouseId?: number | null;
};

export type StockVarianceMovement = {
  itemCode: string;
  quantity?: number | string | null;
  transferType?: string | null;
};

export type StockVarianceRow = {
  code: string;
  name: string;
  initialStock: number;
  additions: number;
  disbursements: number;
  returns: number;
  net: number;
  recordedStock: number;
  expectedStock: number;
  variance: number;
  unitPrice: number;
  status: "متطابق" | "فرق موجب" | "فرق سالب";
};

const numeric = (value: unknown) => Number(value ?? 0) || 0;

export const isReturnType = (value: unknown) => ["return", "مرتجع", "استلام مرتجع", "مرتجع من عميل", "مرتجع للمخزن"].includes(String(value ?? "").trim().toLowerCase());

export function buildStockVarianceRows(
  items: StockVarianceItem[],
  additions: StockVarianceMovement[],
  disbursements: StockVarianceMovement[],
  transfers: StockVarianceMovement[],
  tolerance = 0.001,
): StockVarianceRow[] {
  const additionTotals = new Map<string, number>();
  const disbursementTotals = new Map<string, number>();
  const returnTotals = new Map<string, number>();
  const add = (map: Map<string, number>, row: StockVarianceMovement, quantity = numeric(row.quantity)) => map.set(row.itemCode, (map.get(row.itemCode) ?? 0) + quantity);
  additions.forEach(row => add(additionTotals, row));
  disbursements.forEach(row => add(disbursementTotals, row));
  transfers.filter(row => isReturnType(row.transferType)).forEach(row => add(returnTotals, row));

  return items.map(item => {
    const initialStock = numeric(item.initialStock);
    const additionsTotal = additionTotals.get(item.code) ?? 0;
    const disbursementsTotal = disbursementTotals.get(item.code) ?? 0;
    const returnsTotal = returnTotals.get(item.code) ?? 0;
    const net = initialStock + additionsTotal + returnsTotal - disbursementsTotal;
    const recordedStock = numeric(item.currentStock);
    const variance = net - recordedStock;
    const status = Math.abs(variance) <= tolerance ? "متطابق" : variance > 0 ? "فرق موجب" : "فرق سالب";
    return {
      code: item.code,
      name: item.name,
      initialStock,
      additions: additionsTotal,
      disbursements: disbursementsTotal,
      returns: returnsTotal,
      net,
      recordedStock,
      expectedStock: net,
      variance,
      unitPrice: numeric(item.unitPrice),
      status,
    };
  });
}

export function summarizeStockVariance(rows: StockVarianceRow[]) {
  return {
    total: rows.length,
    matched: rows.filter(row => row.status === "متطابق").length,
    positive: rows.filter(row => row.status === "فرق موجب").length,
    negative: rows.filter(row => row.status === "فرق سالب").length,
    totalVariance: rows.reduce((sum, row) => sum + row.variance, 0),
  };
}
