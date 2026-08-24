import { listAdditionsPaged, listDisbursementsPaged, listTransfersPaged } from "../server/db";

async function verifyTotals<T extends { quantity: string | number; totalValue: string | number }>(name: string, fetchPage: (page: number) => Promise<{ rows: T[]; total: number; totalQuantity: number; totalValue: number; page: number; pageSize: number; pageCount: number }>) {
  const first = await fetchPage(1);
  if (first.rows.length > first.pageSize || first.page < 1 || first.pageCount < 1) throw new Error(`نتيجة ترقيم غير صالحة: ${name}`);
  if (!Number.isFinite(first.totalQuantity) || !Number.isFinite(first.totalValue)) throw new Error(`إجماليات حركة غير صالحة: ${name}`);
  const rows = [...first.rows];
  for (let page = 2; page <= first.pageCount; page += 1) rows.push(...(await fetchPage(page)).rows);
  const actualQuantity = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
  const actualValue = rows.reduce((sum, row) => sum + Number(row.totalValue), 0);
  if (Math.abs(actualQuantity - first.totalQuantity) > 0.0001 || Math.abs(actualValue - first.totalValue) > 0.0001) throw new Error(`إجماليات لا تطابق الصفوف الكاملة: ${name}`);
  return { total: first.total, totalQuantity: first.totalQuantity, totalValue: first.totalValue, page: first.page, pageSize: first.pageSize, pageCount: first.pageCount, returnedRows: first.rows.length };
}

const additions = await verifyTotals("additions", page => listAdditionsPaged({ page, pageSize: 50 }));
const disbursements = await verifyTotals("disbursements", page => listDisbursementsPaged({ page, pageSize: 50 }));
const transfers = await verifyTotals("transfers", page => listTransfersPaged({ page, pageSize: 50 }));
const sampleAddition = await listAdditionsPaged({ page: 1, pageSize: 50 });
const permitSearch = sampleAddition.rows[0]?.eznNum;
const filteredAddition = permitSearch ? await verifyTotals("additions-filtered", page => listAdditionsPaged({ page, pageSize: 50, permitSearch })) : undefined;
console.log(JSON.stringify({ additions, disbursements, transfers, filteredAddition }));
process.exit(0);
