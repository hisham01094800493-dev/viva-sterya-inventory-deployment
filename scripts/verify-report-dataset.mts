import { getReportDataset } from "../server/db";

function assertEqual(label: string, actual: number, expected: number) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

const dataset = await getReportDataset({ includeRows: true });
const summaryOnly = await getReportDataset({});
assertEqual("عدد الإضافات", dataset.summary.additions.count, dataset.additions.length);
assertEqual("عدد أذونات الصرف", dataset.summary.disbursements.count, dataset.disbursements.length);
assertEqual("عدد التحويلات", dataset.summary.transfers.count, dataset.transfers.length);
assertEqual("كل الحركات", dataset.summary.all.count, dataset.additions.length + dataset.disbursements.length + dataset.transfers.length);
assertEqual("ملخص الإضافات دون صفوف", summaryOnly.additions.length, 0);
assertEqual("ملخص الصرف دون صفوف", summaryOnly.disbursements.length, 0);
assertEqual("ملخص التحويلات دون صفوف", summaryOnly.transfers.length, 0);
assertEqual("تطابق ملخص كل الحركات", summaryOnly.summary.all.count, dataset.summary.all.count);

const permit = dataset.additions[0]?.eznNum || dataset.disbursements[0]?.eznNum || dataset.transfers[0]?.eznNum;
if (permit) {
  const filtered = await getReportDataset({ includeRows: true, permitSearch: permit });
  const allRows = [...filtered.additions, ...filtered.disbursements, ...filtered.transfers];
  if (allRows.some(row => !String(row.eznNum).includes(permit))) throw new Error("مرشح رقم الإذن أعاد صفًا غير مطابق");
  assertEqual("إجمالي نتائج رقم الإذن", filtered.summary.all.count, allRows.length);
}

console.log(JSON.stringify({
  additions: dataset.summary.additions,
  disbursements: dataset.summary.disbursements,
  transfers: dataset.summary.transfers,
  returns: dataset.summary.returns,
  variance: dataset.varianceSummary,
}, null, 2));

process.exit(0);
