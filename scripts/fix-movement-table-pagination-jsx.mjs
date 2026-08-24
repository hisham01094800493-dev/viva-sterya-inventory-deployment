import { readFileSync, writeFileSync } from "node:fs";

const path = "/home/ubuntu/viva-sterya-inventory/client/src/pages/InventoryPages.tsx";
let source = readFileSync(path, "utf8");

const effectStart = '  useEffect(() => {\n    if (!totalRows) return;\n    const movementTable = Array.from(document.querySelectorAll("table")).find(table => {\n      const headings = Array.from(table.querySelectorAll("th")).map(cell => cell.textContent?.trim());\n      return headings.includes("رقم الإذن") && headings.includes("الكمية") && headings.includes("الإجمالي");\n    });\n    const hostParent = movementTable?.closest(".overflow-x-auto")?.parentElement;\n    if (!hostParent) return;\n    movementTable.classList.add("movement-data-table");\n    const host = document.createElement("div");\n    host.dataset.movementPagination = kind;\n    hostParent.appendChild(host);\n    const root = createRoot(host);\n    const firstRow = (page - 1) * 50 + 1;\n    const lastRow = Math.min(totalRows, page * 50);\n    root.render(<div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f5] px-5 py-4" dir="rtl"><p className="text-xs font-bold text-slate-500">عرض {firstRow}–{lastRow} من {totalRows} حركة · الصفحة {page} من {pageCount}</p><div className="flex items-center gap-2"><button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1 || query.isFetching} className="rounded-xl border border-[#b9d4d9] bg-white px-4 py-2 text-xs font-black text-[#0d4f62] hover:bg-[#eef7f7] disabled:cursor-not-allowed disabled:opacity-40">السابقة</button><button type="button" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={page >= pageCount || query.isFetching} className="rounded-xl bg-[#0d4f62] px-4 py-2 text-xs font-black text-white hover:bg-[#0a4150] disabled:cursor-not-allowed disabled:opacity-40">{query.isFetching ? "جارٍ التحميل" : "التالية"}</button></div></div>);\n    return () => { movementTable.classList.remove("movement-data-table"); root.unmount(); host.remove(); };\n  }, [kind, page, pageCount, totalRows, query.isFetching]);\n';

if (!source.includes(effectStart)) throw new Error("لم يتم العثور على حقن تنقل جدول الحركات القديم");
source = source.replace(effectStart, "");

const tableStart = '<div className="overflow-x-auto"><table className="table-auto w-max min-w-[780px] text-right">';
if (!source.includes(tableStart)) throw new Error("لم يتم العثور على جدول الحركات الفعلي");
source = source.replace(tableStart, '<div className="overflow-x-auto"><table className="movement-data-table table-auto w-max min-w-[780px] text-right">');

const tableEnd = '</tbody></table></div>}</CardContent></Card><Dialog open={Boolean(permitPreview)}';
const pagination = '</tbody></table></div><div className="movement-table-pagination flex flex-wrap items-center justify-between gap-3 border-t border-[#d5e9ed] bg-[#f8fcfd] px-5 py-4" dir="rtl"><p className="text-xs font-black text-[#0d4f62]">عرض {(page - 1) * 50 + 1}–{Math.min(totalRows, page * 50)} من {totalRows} حركة · الصفحة {page} من {pageCount}</p><div className="flex items-center gap-2"><button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1 || query.isFetching} className="rounded-xl border border-[#93c7d1] bg-white px-4 py-2 text-xs font-black text-[#0d4f62] shadow-sm hover:bg-[#eaf8fa] disabled:cursor-not-allowed disabled:opacity-40">السابقة</button><button type="button" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={page >= pageCount || query.isFetching} className="rounded-xl bg-[#0d7180] px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-[#095d69] disabled:cursor-not-allowed disabled:opacity-40">{query.isFetching ? "جارٍ التحميل" : "التالية"}</button></div></div>}</CardContent></Card><Dialog open={Boolean(permitPreview)}';

if (!source.includes(tableEnd)) throw new Error("لم يتم العثور على نهاية جدول الحركات");
source = source.replace(tableEnd, pagination);

const oldFinder = 'return headings.includes("رقم الإذن") && headings.includes("الكمية") && headings.includes("الإجمالي");';
const newFinder = 'return headings.includes("رقم الإذن") && headings.includes("الكمية") && table.classList.contains("movement-data-table");';
if (!source.includes(oldFinder)) throw new Error("لم يتم العثور على باحث جدول الحركات");
source = source.replaceAll(oldFinder, newFinder);

writeFileSync(path, source, "utf8");
