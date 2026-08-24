import { readFileSync, writeFileSync } from "node:fs";

const path = "/home/ubuntu/viva-sterya-inventory/client/src/pages/InventoryPages.tsx";
let source = readFileSync(path, "utf8");

const start = ': <div className="overflow-x-auto"><table className="movement-data-table table-auto w-max min-w-[780px] text-right">';
const end = '</button></div></div>}</CardContent></Card><Dialog open={Boolean(permitPreview)}';

if (!source.includes(start)) throw new Error("لم يتم العثور على بداية جدول الحركات للتغليف");
if (!source.includes(end)) throw new Error("لم يتم العثور على نهاية شريط الصفحات للتغليف");

source = source.replace(start, ': <><div className="overflow-x-auto"><table className="movement-data-table table-auto w-max min-w-[780px] text-right">');
source = source.replace(end, '</button></div></div></>}</CardContent></Card><Dialog open={Boolean(permitPreview)}');

writeFileSync(path, source, "utf8");
