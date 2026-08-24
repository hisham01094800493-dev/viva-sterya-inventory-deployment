import { inventoryDateKey } from "./inventoryDate";

export type UnlinkedPartyMovement = {
  date: unknown;
  destination?: string | null;
  customerId?: number | null;
  quantity: unknown;
  unitPrice?: unknown;
};

export type UnlinkedPartySummary = {
  name: string;
  movements: number;
  quantity: number;
  value: number;
  firstDate: string;
  lastDate: string;
};

export function buildUnlinkedCustomerParties(rows: UnlinkedPartyMovement[]): UnlinkedPartySummary[] {
  const groups = new Map<string, UnlinkedPartySummary>();
  for (const row of rows) {
    const name = String(row.destination ?? "").trim();
    if (!name || row.customerId !== null && row.customerId !== undefined) continue;
    const quantity = Number(row.quantity ?? 0);
    const unitPrice = Number(row.unitPrice ?? 0);
    const date = inventoryDateKey(row.date);
    const current = groups.get(name);
    if (!current) {
      groups.set(name, { name, movements: 1, quantity, value: Number((quantity * unitPrice).toFixed(2)), firstDate: date, lastDate: date });
      continue;
    }
    current.movements += 1;
    current.quantity += quantity;
    current.value = Number((current.value + quantity * unitPrice).toFixed(2));
    if (date < current.firstDate) current.firstDate = date;
    if (date > current.lastDate) current.lastDate = date;
  }
  return Array.from(groups.values()).sort((a, b) => b.movements - a.movements || a.name.localeCompare(b.name, "ar"));
}
