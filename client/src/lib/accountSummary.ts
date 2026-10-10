type Movement = { itemCode: string; quantity: unknown; unitPrice?: unknown; supplierId?: number | null; supplier?: string | null; store?: string | null; customerId?: number | null; destination?: string | null };
type Item = { code: string; unitPrice?: unknown };
type Party = { id: number; name: string };
export type AccountSummaryRow = { name: string; quantity: number; value: number; movements: number };

export function buildAccountSummary(additions: Movement[], disbursements: Movement[], items: Item[], suppliers: Party[], customers: Party[]) {
  const itemByCode = new Map(items.map(item => [item.code, item]));
  const valueOf = (row: Movement) => { const unitPrice = Number(row.unitPrice ?? itemByCode.get(row.itemCode)?.unitPrice ?? 0); return Number((Number(row.quantity) * unitPrice).toFixed(2)); };
  const supplierNames = new Map(suppliers.map(supplier => [supplier.id, supplier.name]));
  const customerNames = new Map(customers.map(customer => [customer.id, customer.name]));
  const supplierMap = new Map<string, AccountSummaryRow>();
  const customerMap = new Map<string, AccountSummaryRow>();
  for (const row of additions) { const name = supplierNames.get(row.supplierId ?? 0) || row.supplier || row.store || "بدون مورد"; const current = supplierMap.get(name) || { name, quantity: 0, value: 0, movements: 0 }; current.quantity += Number(row.quantity); current.value += valueOf(row); current.movements += 1; supplierMap.set(name, current); }
  for (const row of disbursements) { const name = customerNames.get(row.customerId ?? 0) || row.destination || row.store || "بدون جهة"; const current = customerMap.get(name) || { name, quantity: 0, value: 0, movements: 0 }; current.quantity += Number(row.quantity); current.value += valueOf(row); current.movements += 1; customerMap.set(name, current); }
  return { suppliers: Array.from(supplierMap.values()).sort((a, b) => b.value - a.value), customers: Array.from(customerMap.values()).sort((a, b) => b.value - a.value) };
}
