export type MovementFilterRow = {
  date?: unknown;
  eznNum?: unknown;
  itemName?: unknown;
  itemCode?: unknown;
  supplierId?: unknown;
  customerId?: unknown;
  purpose?: unknown;
  disburseType?: unknown;
  notes?: unknown;
};

export function filterMovementRowsByItemAndPermit<T extends MovementFilterRow>(
  rows: T[],
  options: { kind: "additions" | "disbursements" | "transfers"; supplierId?: string; customerId?: string; itemSearch?: string; permitSearch?: string; purposeSearch?: string; fromDate?: string; toDate?: string },
  dateKey: (value: unknown) => string,
): T[] {
  const itemSearch = options.itemSearch?.trim().toLocaleLowerCase("ar-EG") ?? "";
  const permitSearch = options.permitSearch?.trim().toLocaleLowerCase("ar-EG") ?? "";
  const purposeSearch = options.purposeSearch?.trim().toLocaleLowerCase("ar-EG") ?? "";
  return rows.filter(row => {
    const date = dateKey(row.date);
    const supplierMatch = options.kind !== "additions" || !options.supplierId || options.supplierId === "all" || String(row.supplierId ?? "") === options.supplierId;
    const customerMatch = options.kind !== "disbursements" || !options.customerId || options.customerId === "all" || String(row.customerId ?? "") === options.customerId;
    const itemMatch = !itemSearch || String(row.itemName ?? "").toLocaleLowerCase("ar-EG").includes(itemSearch) || String(row.itemCode ?? "").toLocaleLowerCase("ar-EG").includes(itemSearch);
    const permitMatch = !permitSearch || String(row.eznNum ?? "").toLocaleLowerCase("ar-EG").includes(permitSearch);
    const purposeValue = options.kind === "additions" ? row.purpose : options.kind === "disbursements" ? formatDisbursementPurpose(row.disburseType) : row.notes;
    const purposeMatch = !purposeSearch || String(purposeValue ?? "").toLocaleLowerCase("ar-EG").includes(purposeSearch);
    return supplierMatch && customerMatch && itemMatch && permitMatch && purposeMatch && (!options.fromDate || date >= options.fromDate) && (!options.toDate || date <= options.toDate);
  });
}

export function normalizeMovementSearch(value: string) {
  return value.trim().toLocaleLowerCase("ar-EG");
}
import { formatDisbursementPurpose } from "./movementPurpose";
