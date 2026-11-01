import type { MovementExportItem } from "./inventoryExportFiles";
import { inventoryDateKey } from "./inventoryDate";

type MovementInput = { id: number; date: unknown; eznNum: string; itemCode: string; quantity: unknown; unitPrice?: unknown; totalValue?: unknown; customerId?: number | null; customerName?: string | null; customer?: string | null; supplier?: string | null; destination?: string | null; purpose?: string | null; disburseType?: string | null; notes?: string | null; documentImageUrl?: string | null; store?: string | null; buildingName?: string | null; buildingCode?: string | null; fromStore?: string | null; toStore?: string | null; transferType?: string | null };
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
const disbursementParty = (row: MovementInput, fallback?: string) => {
  const customer = party(row.customerName || row.customer || row.destination || row.store || fallback);
  const building = String(row.buildingName || row.buildingCode || "").trim().replace(/^مبنى\s*/, "");
  return building ? `${customer} — المبنى: ‎${building}‎` : customer;
};
const isLegacyReturn = (row: MovementInput) => {
  const permit = String(row.eznNum ?? "").trim();
  const type = String(row.disburseType ?? "").trim().toLowerCase();
  if (Number(row.quantity ?? 0) < 0) return false;
  if (permit === "5207" || /تصحيح|عكس موثق|إلغاء موثق/.test(type)) return false;
  return ["18", "19"].includes(permit) || /مرتجع|ارتجاع|return/i.test(`${row.disburseType ?? ""} ${row.notes ?? ""}`);
};

export function buildOutboundReturnRows(disbursements: MovementInput[], transfers: MovementInput[], items: ItemInput[], additions: MovementInput[] = [], defaults: { supplier?: string; customer?: string } = {}) {
  const itemByCode = new Map(items.map(item => [item.code, item]));
  const useDescriptiveParty = Boolean(defaults.supplier || defaults.customer);
  const normalDisbursements = disbursements.filter(row => !isLegacyReturn(row));
  const legacyReturns = disbursements.filter(isLegacyReturn);
  return [
    ...additions.map(row => ({ id: row.id, type: useDescriptiveParty ? `توريد من: ${party(row.supplier || row.store || defaults.supplier)}` : "إضافة", date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, name: itemName(row, itemByCode), quantity: Number(row.quantity), isNegativeCorrection: Number(row.quantity) < 0, detail: `وارد من: ${party(row.supplier || row.store || defaults.supplier)}`, purpose: row.purpose || null, additionPurpose: row.purpose || null, disbursementPurpose: null, unitPrice: price(row, itemByCode.get(row.itemCode)), totalValue: rowValue(row, itemByCode.get(row.itemCode)), imageUrl: itemByCode.get(row.itemCode)?.imageUrl, documentImageUrl: row.documentImageUrl })),
    ...normalDisbursements.map(row => ({ id: row.id, type: useDescriptiveParty ? `صرف إلى: ${disbursementParty(row, defaults.customer)}` : "صرف", date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, name: itemName(row, itemByCode), quantity: Number(row.quantity), isNegativeCorrection: Number(row.quantity) < 0, detail: `منصرف إلى: ${disbursementParty(row, defaults.customer)}`, purpose: row.disburseType || null, additionPurpose: null, disbursementPurpose: row.disburseType || null, unitPrice: price(row, itemByCode.get(row.itemCode)), totalValue: rowValue(row, itemByCode.get(row.itemCode)), imageUrl: itemByCode.get(row.itemCode)?.imageUrl, documentImageUrl: row.documentImageUrl })),
    ...legacyReturns.map(row => ({ id: row.id, type: "مرتجع", date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, name: itemName(row, itemByCode), quantity: Math.abs(Number(row.quantity)), isNegativeCorrection: false, detail: `مرتجع من: ${party(row.destination || row.store)} إلى: المخزن`, purpose: row.disburseType || row.notes || null, additionPurpose: null, disbursementPurpose: null, returnPurpose: row.disburseType || row.notes || null, unitPrice: price(row, itemByCode.get(row.itemCode)), totalValue: Math.abs(rowValue(row, itemByCode.get(row.itemCode))), imageUrl: itemByCode.get(row.itemCode)?.imageUrl, documentImageUrl: row.documentImageUrl })),
    ...transfers.filter(row => isReturn(row.transferType)).map(row => ({ id: row.id, type: returnLabel(row.transferType), date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, name: itemName(row, itemByCode), quantity: Number(row.quantity), isNegativeCorrection: Number(row.quantity) < 0, detail: `${returnLabel(row.transferType)} من: ${party(row.fromStore)} إلى: ${party(row.toStore)}`, additionPurpose: null, disbursementPurpose: null, returnPurpose: row.notes || null, unitPrice: price(row, itemByCode.get(row.itemCode)), totalValue: rowValue(row, itemByCode.get(row.itemCode)), imageUrl: itemByCode.get(row.itemCode)?.imageUrl, documentImageUrl: row.documentImageUrl })),
    ...(useDescriptiveParty ? transfers.filter(row => !isReturn(row.transferType)).map(row => ({ id: row.id, type: `تحويل داخلي إلى: ${party(row.toStore || defaults.customer)}`, date: dateOnly(row.date), eznNum: row.eznNum, itemCode: row.itemCode, name: itemName(row, itemByCode), quantity: Number(row.quantity), isNegativeCorrection: Number(row.quantity) < 0, detail: `تحويل من: ${party(row.fromStore)} إلى: ${party(row.toStore || defaults.customer)}`, additionPurpose: null, disbursementPurpose: null, unitPrice: price(row, itemByCode.get(row.itemCode)), totalValue: rowValue(row, itemByCode.get(row.itemCode)), imageUrl: itemByCode.get(row.itemCode)?.imageUrl, documentImageUrl: row.documentImageUrl })) : []),
  ].sort((a, b) => b.date.localeCompare(a.date));
}
