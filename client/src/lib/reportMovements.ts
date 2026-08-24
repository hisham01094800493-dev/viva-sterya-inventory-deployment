import type { MovementExportItem } from "./inventoryExportFiles";
import { inventoryDateKey } from "./inventoryDate";

type MovementInput = { id: number; date: unknown; eznNum: string; itemCode: string; quantity: unknown; unitPrice?: unknown; totalValue?: unknown; customerId?: number | null; customerName?: string | null; supplier?: string | null; destination?: string | null; purpose?: string | null; disburseType?: string | null; notes?: string | null; documentImageUrl?: string | null; store?: string | null; fromStore?: string | null; toStore?: string | null; transferType?: string | null };
type ItemInput = { code: string; name?: string | null; imageUrl?: string | null; unitPrice?: unknown };
const dateOnly = (value: unknown) => inventoryDateKey(value);
const isReturn = (value: unknown) => ["return", "مرتجع", "استلام مرتجع", "مرتجع من عميل", "مرتجع للمخزن"].includes(String(value ?? "").trim().toLowerCase());
const returnLabel = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  if (normalized === "مرتجع من عميل") return "مرتجع من عميل";
  if (normalized === "مرتجع للمخزن") return "مرتجع للمخزن";
  return "مرتجع";
};
const price = (row: MovementInput, item?: ItemInput) => Number(row.unitPrice ?? item?.unitPrice ?? 0);
const rowValue = (row: MovementInput, item?: ItemInput) => { const unitPrice = price(row, item); return Number(row.totalValue ?? (Number(row.quantity) * unitPrice).toFixed(2)); };
const itemName = (row: MovementInput, itemByCode: Map<string, ItemInput>) => itemByCode.get(row.itemCode)?.name || row.itemCode;
const party = (value?: string | null) => value || "—";

export function buildOutboundReturnRows(disbursements: MovementInput[], transfers: MovementInput[], items: ItemInput[], additions: MovementInput[] = [], defaults: { supplier?: string; customer?: string } = {}): MovementExportItem[] {
  const itemByCode = new Map(items.map(item => [item.code, item]));
  const useDescriptiveParty = Boolean(defaults.supplier || defaults.customer);
  return [
    ...additions.map(row => ({ id: row.id, type: useDescriptiveParty ? `توريد من: ${party(row.supplier || row.store || defaults.supplier)}` : "إضافة", date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, name: itemName(row, itemByCode), quantity: Number(row.quantity), isNegativeCorrection: Number(row.quantity) < 0, detail: `وارد من: ${party(row.supplier || row.store || defaults.supplier)}`, purpose: row.purpose || null, additionPurpose: row.purpose || null, disbursementPurpose: null, unitPrice: price(row, itemByCode.get(row.itemCode)), totalValue: rowValue(row, itemByCode.get(row.itemCode)), imageUrl: itemByCode.get(row.itemCode)?.imageUrl, documentImageUrl: row.documentImageUrl })),
    ...disbursements.map(row => ({ id: row.id, type: useDescriptiveParty ? `صرف إلى: ${party(row.customerName || row.destination || row.store || defaults.customer)}` : "صرف", date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, name: itemName(row, itemByCode), quantity: Number(row.quantity), isNegativeCorrection: Number(row.quantity) < 0, detail: `منصرف إلى: ${party(row.customerName || row.destination || row.store || defaults.customer)}`, purpose: row.disburseType || null, additionPurpose: null, disbursementPurpose: row.disburseType || null, unitPrice: price(row, itemByCode.get(row.itemCode)), totalValue: rowValue(row, itemByCode.get(row.itemCode)), imageUrl: itemByCode.get(row.itemCode)?.imageUrl, documentImageUrl: row.documentImageUrl })),
    ...transfers.filter(row => isReturn(row.transferType)).map(row => ({ id: row.id, type: returnLabel(row.transferType), date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, name: itemName(row, itemByCode), quantity: Number(row.quantity), isNegativeCorrection: Number(row.quantity) < 0, detail: `${returnLabel(row.transferType)} من: ${party(row.fromStore)} إلى: ${party(row.toStore)}`, additionPurpose: null, disbursementPurpose: null, returnPurpose: row.notes || null, unitPrice: price(row, itemByCode.get(row.itemCode)), totalValue: rowValue(row, itemByCode.get(row.itemCode)), imageUrl: itemByCode.get(row.itemCode)?.imageUrl, documentImageUrl: row.documentImageUrl })),
    ...(useDescriptiveParty ? transfers.filter(row => !isReturn(row.transferType)).map(row => ({ id: row.id, type: `تحويل داخلي إلى: ${party(row.toStore || defaults.customer)}`, date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, name: itemName(row, itemByCode), quantity: Number(row.quantity), isNegativeCorrection: Number(row.quantity) < 0, detail: `تحويل من: ${party(row.fromStore)} إلى: ${party(row.toStore || defaults.customer)}`, additionPurpose: null, disbursementPurpose: null, unitPrice: price(row, itemByCode.get(row.itemCode)), totalValue: rowValue(row, itemByCode.get(row.itemCode)), imageUrl: itemByCode.get(row.itemCode)?.imageUrl, documentImageUrl: row.documentImageUrl })) : []),
  ].sort((a, b) => b.date.localeCompare(a.date));
}
