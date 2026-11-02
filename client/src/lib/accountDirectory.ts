export type AccountStatementRow = { id: number; date: string; number: string; item: string | null; itemCode: string; quantity: number; unitPrice: number; total: number; type: "إضافة" | "صرف" | "مرتجع" | "تحويل"; documentImageUrl: string | null };

type DirectoryRow = { name: string; phone?: string | null; email?: string | null };

export function getInventoryStatus(currentStock: unknown, reorderLevel: unknown) {
  const stock = Number(currentStock ?? 0);
  const reorder = Number(reorderLevel ?? 0);
  if (stock <= 0) return { label: "نافد", className: "bg-[#fbeceb] text-[#bd5147]", dotClassName: "bg-[#bd5147]" };
  if (reorder > 0 && stock <= reorder) return { label: "منخفض", className: "bg-[#fff4df] text-[#a96821]", dotClassName: "bg-[#d08a3b]" };
  return { label: "متوفر", className: "bg-[#e8f7f6] text-[#0d806c]", dotClassName: "bg-[#0d806c]" };
}

export function getInventoryStatusLabel(currentStock: unknown, reorderLevel: unknown) {
  return getInventoryStatus(currentStock, reorderLevel).label;
}

export function summarizeInventoryStatuses(rows: Array<{ currentStock?: unknown; reorderLevel?: unknown }>) {
  return rows.reduce((summary, row) => {
    const label = getInventoryStatusLabel(row.currentStock, row.reorderLevel);
    if (label === "نافد") summary.outOfStock += 1;
    else if (label === "منخفض") summary.low += 1;
    else summary.available += 1;
    return summary;
  }, { available: 0, low: 0, outOfStock: 0 });
}

export function filterAndSortDirectory<T extends DirectoryRow>(rows: T[], search: string, sortKey: "name" | "phone" | "email", direction: "asc" | "desc") {
  const normalized = search.trim().toLocaleLowerCase();
  return rows.filter(row => !normalized || [row.name, row.phone, row.email].some(value => String(value ?? "").toLocaleLowerCase().includes(normalized))).sort((a, b) => {
    const left = String(a[sortKey] ?? a.name);
    const right = String(b[sortKey] ?? b.name);
    return direction === "asc" ? left.localeCompare(right, "ar") : right.localeCompare(left, "ar");
  });
}

function isReturnMovement(value: unknown) {
  return /مرتجع|ارتجاع|return/i.test(String(value ?? ""));
}

export function buildAccountStatementRows(rows: Array<{ id: number; date: string; eznNum: string; itemName?: string | null; itemCode?: string | null; quantity: unknown; unitPrice?: unknown; totalValue?: unknown; documentImageUrl?: string | null; supplierId?: number | null; customerId?: number | null; transferType?: string | null }>, kind: "supplier" | "customer", entityId: number): AccountStatementRow[] {
  return rows.filter(row => (kind === "supplier" ? row.supplierId === entityId : row.customerId === entityId)).map(row => {
    const type = kind === "supplier" ? "إضافة" : row.transferType ? (isReturnMovement(row.transferType) ? "مرتجع" : "تحويل") : "صرف";
    return { id: row.id, date: row.date, number: row.eznNum, item: row.itemName ?? null, itemCode: row.itemCode ?? "", quantity: Number(row.quantity ?? 0), unitPrice: Number(row.unitPrice ?? 0), total: Number(row.totalValue ?? 0), type, documentImageUrl: row.documentImageUrl ?? null };
  });
}

export function normalizeAccountSearch(value: unknown) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ar-EG").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[\u064B-\u065F\u0670]/g, "").replace(/\s+/g, " ").trim();
}

export function filterAccountStatementRows(rows: AccountStatementRow[], search: { permit: string; item: string }) {
  const permit = normalizeAccountSearch(search.permit);
  const itemTokens = normalizeAccountSearch(search.item).split(" ").filter(Boolean);
  return rows.filter(row => {
    const permitMatch = !permit || normalizeAccountSearch(row.number).includes(permit);
    const itemText = normalizeAccountSearch(`${row.item ?? ""} ${row.itemCode}`);
    return permitMatch && (!itemTokens.length || itemTokens.every(token => itemText.includes(token)));
  });
}
