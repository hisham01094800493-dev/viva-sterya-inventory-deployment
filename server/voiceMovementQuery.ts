import { fromMoneyScaled, fromScaled, toMoneyScaled, toScaled } from "./db/scale";
import { normalizeVoiceStockText } from "./voiceStockQuery";

export type VoiceMovementRow = { id: number; date: string; itemCode: string; itemName: string | null; quantity: string | number; unitPrice: string | number | null; totalValue: string | number | null; warehouseId?: number | null; supplier?: string | null; customer?: string | null; store?: string | null; fromStore?: string | null; toStore?: string | null; movementType: "addition" | "disbursement" | "transfer" };
export type VoiceMovementWarehouse = { id: number; name: string };
export function buildVoiceMovementQueryResult(input: { query: string; rows: VoiceMovementRow[]; warehouses: VoiceMovementWarehouse[]; allowedWarehouseIds: number[]; canViewFinancialDetails: boolean }) {
  const query = normalizeVoiceStockText(input.query);
  const visible = input.allowedWarehouseIds.length ? input.rows.filter(row => input.allowedWarehouseIds.includes(row.warehouseId ?? -1)) : input.rows;
  const additions = /مورد|توريد|وارد|اضاف|اضافة|المورد/.test(query);
  const disbursements = /صرف|مصروف|منصرف|عميل|جهة|اخذ|أخذ/.test(query);
  const transfers = /تحويل|نقل|من مخزن|الى مخزن|إلى مخزن/.test(query);
  const typeFiltered = (additions && !disbursements && !transfers) ? visible.filter(row => row.movementType === "addition") : (disbursements && !transfers ? visible.filter(row => row.movementType === "disbursement") : (transfers ? visible.filter(row => row.movementType === "transfer") : visible));
  const tokens = query.split(" ").filter(token => token.length > 1 && !["كم", "كام", "قيمة", "الكمية", "المورد", "المورده", "المورد", "من", "الى", "إلى", "في", "فى", "عن", "ل", "منه"].includes(token));
  const matching = typeFiltered.filter(row => {
    const haystack = normalizeVoiceStockText([row.itemCode, row.itemName, row.supplier, row.customer, row.store, row.fromStore, row.toStore].filter(Boolean).join(" "));
    return tokens.length === 0 || tokens.some(token => haystack.includes(token));
  });
  const source = matching.length ? matching : typeFiltered;
  const quantityScaled = source.reduce((sum, row) => sum + toScaled(row.quantity), 0);
  const totalMoneyScaled = source.reduce((sum, row) => sum + toMoneyScaled(row.totalValue), 0);
  const byType = ["addition", "disbursement", "transfer"].map(type => ({ type, count: source.filter(row => row.movementType === type).length, quantity: fromScaled(source.filter(row => row.movementType === type).reduce((sum, row) => sum + toScaled(row.quantity), 0)) })).filter(row => row.count);
  return { matched: source.length > 0, movementType: transfers ? "transfer" : additions ? "addition" : disbursements ? "disbursement" : "all", count: source.length, quantity: fromScaled(quantityScaled), totalValue: input.canViewFinancialDetails ? fromMoneyScaled(totalMoneyScaled) : null, byType, rows: source.slice(0, 20).map(row => ({ id: row.id, date: row.date, movementType: row.movementType, itemCode: row.itemCode, itemName: row.itemName, quantity: fromScaled(toScaled(row.quantity)), party: row.supplier ?? row.customer ?? row.store ?? row.fromStore ?? null, fromStore: row.fromStore, toStore: row.toStore, totalValue: input.canViewFinancialDetails ? fromMoneyScaled(toMoneyScaled(row.totalValue)) : null, warehouseName: input.warehouses.find(warehouse => warehouse.id === row.warehouseId)?.name ?? null })) };
}
