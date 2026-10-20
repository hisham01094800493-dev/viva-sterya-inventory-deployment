import type { MovementExportItem } from "./inventoryExportFiles";

export type AccountItemSummary = { itemCode: string; itemName: string; netQuantity: number };

/** Summarizes signed item quantities without changing or collapsing statement detail rows. */
export function summarizeAccountStatementItems(rows: MovementExportItem[]): AccountItemSummary[] {
  const summaries = new Map<string, AccountItemSummary>();

  for (const row of rows) {
    const itemCode = String(row.itemCode || "").trim();
    const itemName = String(row.name || "").trim();
    const identity = (itemCode || itemName || "—").toLocaleLowerCase("ar-EG");
    let summary = summaries.get(identity);

    if (!summary) {
      summary = { itemCode, itemName: itemName && itemName !== "—" ? itemName : itemCode || "—", netQuantity: 0 };
      summaries.set(identity, summary);
    }

    summary.netQuantity += Number(row.quantity ?? 0);
  }

  return Array.from(summaries.values(), summary => ({
    ...summary,
    netQuantity: Number(summary.netQuantity.toFixed(3)),
  }));
}
