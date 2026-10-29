export type BuildingCostInput = {
  id: number;
  name: string;
  code: string;
  type?: string | null;
  budget?: unknown;
  status?: string | null;
};

export type BuildingDisbursementInput = {
  buildingId?: number | null;
  quantity?: unknown;
  totalValue?: unknown;
  date?: string | null;
};

export type BuildingCostComparisonRow = {
  buildingId: number | null;
  name: string;
  code: string;
  type: string | null;
  budget: number;
  movements: number;
  quantity: number;
  cost: number;
  remainingBudget: number;
  budgetUsagePercent: number | null;
  isUnassigned?: boolean;
};

export type BuildingCostComparison = {
  rows: BuildingCostComparisonRow[];
  totals: {
    movements: number;
    quantity: number;
    cost: number;
    budget: number;
    remainingBudget: number;
  };
};

function inDateRange(value: string | null | undefined, fromDate?: string, toDate?: string) {
  const date = String(value ?? "").slice(0, 10);
  return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
}

export function buildBuildingCostComparison(
  buildingRows: BuildingCostInput[],
  disbursementRows: BuildingDisbursementInput[],
  options: { fromDate?: string; toDate?: string } = {},
): BuildingCostComparison {
  const grouped = new Map<number | null, { movements: number; quantity: number; cost: number }>();
  for (const row of disbursementRows) {
    if (!inDateRange(row.date, options.fromDate, options.toDate)) continue;
    const key = row.buildingId == null ? null : Number(row.buildingId);
    const current = grouped.get(key) ?? { movements: 0, quantity: 0, cost: 0 };
    current.movements += 1;
    current.quantity += Math.abs(Number(row.quantity ?? 0));
    current.cost += Math.abs(Number(row.totalValue ?? 0));
    grouped.set(key, current);
  }

  const rows: BuildingCostComparisonRow[] = buildingRows.map(building => {
    const metrics = grouped.get(building.id) ?? { movements: 0, quantity: 0, cost: 0 };
    const budget = Math.max(0, Number(building.budget ?? 0));
    return {
      buildingId: building.id,
      name: building.name,
      code: building.code,
      type: building.type ?? null,
      budget,
      ...metrics,
      remainingBudget: budget - metrics.cost,
      budgetUsagePercent: budget > 0 ? (metrics.cost / budget) * 100 : null,
    };
  });

  const unassigned = grouped.get(null);
  if (unassigned) {
    rows.push({
      buildingId: null,
      name: "صرف غير مرتبط بمبنى",
      code: "—",
      type: null,
      budget: 0,
      ...unassigned,
      remainingBudget: -unassigned.cost,
      budgetUsagePercent: null,
      isUnassigned: true,
    });
  }

  rows.sort((left, right) => right.cost - left.cost || left.name.localeCompare(right.name, "ar"));
  const totals = rows.reduce((summary, row) => ({
    movements: summary.movements + row.movements,
    quantity: summary.quantity + row.quantity,
    cost: summary.cost + row.cost,
    budget: summary.budget + row.budget,
    remainingBudget: summary.remainingBudget + row.remainingBudget,
  }), { movements: 0, quantity: 0, cost: 0, budget: 0, remainingBudget: 0 });
  return { rows, totals };
}
