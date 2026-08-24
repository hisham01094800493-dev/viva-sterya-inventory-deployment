import { readFileSync, writeFileSync } from "node:fs";

const path = "/home/ubuntu/viva-sterya-inventory/client/src/pages/InventoryPages.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`لم يتم العثور على موضع ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  '<div className="grid gap-4 sm:grid-cols-3"><Card className="border-0 bg-white shadow-sm"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f1f2] text-[#0d4f62]">',
  '<div className={`grid gap-4 ${showMovementFinancialDetails ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}><Card className="border-0 bg-white shadow-sm"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f1f2] text-[#0d4f62]">',
  "شبكة بطاقات الحركات",
);
replaceOnce(
  '<Card className="border-0 bg-white shadow-sm"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f3f1] text-[#0d806c]"><Settings2 className="h-5 w-5" /></div><div><p className="text-xs font-bold text-slate-400">حالة التحقق</p><p className="mt-1 text-sm font-black text-[#0d806c]">متصلة بالرصيد المباشر</p></div></CardContent></Card></div><Card className="modern-card border-0 bg-white/85',
  '{showMovementFinancialDetails ? <Card className="border-0 bg-white shadow-sm"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f3f1] text-[#0d806c]"><Settings2 className="h-5 w-5" /></div><div><p className="text-xs font-bold text-slate-400">حالة التحقق</p><p className="mt-1 text-sm font-black text-[#0d806c]">متصلة بالرصيد المباشر</p></div></CardContent></Card> : null}</div><Card className="modern-card border-0 bg-white/85',
  "بطاقة إجمالي القيمة",
);

writeFileSync(path, source, "utf8");
