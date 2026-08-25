import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { getGlobalSearchRoute, parseGlobalVoiceSearch, simplifyArabicForSearch } from "@/lib/globalVoiceSearch";
import { Mic, Package, ReceiptText, Search, Truck, UserRound, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { VoiceInputButton } from "./VoiceInputButton";

type Result = { key: string; label: string; description: string; href: string; icon: "item" | "supplier" | "customer" | "movement" };

const Icon = ({ kind }: { kind: Result["icon"] }) => kind === "item" ? <Package className="h-4 w-4" /> : kind === "supplier" ? <Truck className="h-4 w-4" /> : kind === "customer" ? <UsersRound className="h-4 w-4" /> : <ReceiptText className="h-4 w-4" />;

export function GlobalVoiceSearch() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const command = useMemo(() => parseGlobalVoiceSearch(text), [text]);
  const enabled = command.terms.trim().length >= 2;
  const movementSearch = command.permitNumber ? { permitSearch: command.permitNumber } : { itemSearch: command.terms };
  const items = trpc.items.list.useQuery({ search: command.terms }, { enabled });
  const suppliers = trpc.suppliers.list.useQuery(undefined, { enabled });
  const customers = trpc.customers.list.useQuery(undefined, { enabled });
  const additions = trpc.additions.listPaged.useQuery({ page: 1, pageSize: 8, ...movementSearch }, { enabled: enabled && (command.intent === "all" || command.intent === "additions") });
  const disbursements = trpc.disbursements.listPaged.useQuery({ page: 1, pageSize: 8, ...movementSearch }, { enabled: enabled && (command.intent === "all" || command.intent === "disbursements") });
  const transfers = trpc.transfers.listPaged.useQuery({ page: 1, pageSize: 8, ...movementSearch }, { enabled: enabled && (command.intent === "all" || command.intent === "transfers") });

  const results = useMemo<Result[]>(() => {
    if (!enabled) return [];
    const matches = (value: unknown) => simplifyArabicForSearch(String(value ?? "")).includes(simplifyArabicForSearch(command.terms));
    const only = (accepted: string[]) => command.intent === "all" || accepted.includes(command.intent);
    const next: Result[] = [];
    if (only(["item", "item-card"])) for (const item of items.data ?? []) next.push({ key: `item-${item.id}`, label: item.name, description: `صنف · الكود ${item.code} · افتح كارت الحركة`, href: getGlobalSearchRoute(command.intent === "item-card" ? "item-card" : "item", command.terms, item.id), icon: "item" });
    if (only(["supplier", "supplier-statement", "supplier-report"])) for (const supplier of (suppliers.data ?? []).filter(item => matches(item.name) || matches(item.phone))) next.push({ key: `supplier-${supplier.id}`, label: supplier.name, description: command.intent === "supplier-report" ? `تقرير توريدات المورد${command.period ? ` · ${command.period.label}` : ""}` : "مورد · فتح كشف الحساب", href: getGlobalSearchRoute(command.intent === "supplier-report" ? "supplier-report" : "supplier-statement", supplier.name, supplier.id, undefined, command.period), icon: "supplier" });
    if (only(["customer", "customer-statement"])) for (const customer of (customers.data ?? []).filter(item => matches(item.name) || matches(item.phone))) next.push({ key: `customer-${customer.id}`, label: customer.name, description: "عميل أو جهة صرف · فتح كشف الحساب", href: getGlobalSearchRoute("customer-statement", command.terms, customer.id), icon: "customer" });
    const appendMovements = (rows: any[] | undefined, kind: "additions" | "disbursements" | "transfers", title: string) => rows?.forEach(row => next.push({ key: `${kind}-${row.id}`, label: `${title} · إذن ${row.eznNum}`, description: `${row.itemName || row.itemCode} · ${row.date}`, href: getGlobalSearchRoute(kind, command.terms, undefined, command.permitNumber), icon: "movement" }));
    if (only(["additions"])) appendMovements(additions.data?.rows, "additions", "إضافة");
    if (only(["disbursements"])) appendMovements(disbursements.data?.rows, "disbursements", "صرف");
    if (only(["transfers"])) appendMovements(transfers.data?.rows, "transfers", "تحويل أو مرتجع");
    return next.slice(0, 12);
  }, [additions.data?.rows, command.intent, command.period, command.permitNumber, command.terms, customers.data, disbursements.data?.rows, enabled, items.data, suppliers.data, transfers.data?.rows]);

  function go(href: string) { setOpen(false); setLocation(href); }

  return <><button type="button" onClick={() => setOpen(true)} aria-label="بحث شامل بالصوت" title="بحث شامل بالصوت" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#8bcdd2] bg-[#e8f7f6] text-[#0d7180] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#d7f0ef] active:scale-95"><Mic className="h-4 w-4" /></button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl overflow-hidden rounded-3xl border-[#b9dfe1] p-0" dir="rtl"><DialogHeader className="border-b border-[#dceff0] bg-[#f4fbfb] px-6 pt-6 pb-5"><DialogTitle className="flex items-center gap-2 text-xl font-black text-[#0d4f62]"><Mic className="h-5 w-5" />بحث شامل بالصوت</DialogTitle><DialogDescription className="leading-6">قل مثلًا: «كارت حركة الصنف أسمنت»، «كشف حساب المورد النور»، «إذن صرف رقم 124»، أو «تقرير مبيعات المورد النور لشهر مارس».</DialogDescription></DialogHeader><div className="space-y-4 p-5"><div className="flex items-center gap-2"><div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0d7180]" /><Input value={text} onChange={event => setText(event.target.value)} placeholder="تحدث أو اكتب ما تبحث عنه…" className="h-12 rounded-2xl border-[#b9dfe1] bg-white pr-10 font-bold text-[#102a43]" autoFocus /></div><VoiceInputButton onText={setText} label="ابدأ البحث الصوتي الشامل" className="h-12 w-12 rounded-2xl" /></div>{!enabled ? <div className="rounded-2xl border border-dashed border-[#b9dfe1] bg-[#fbfefe] p-6 text-center text-sm leading-7 text-slate-500">يمكنك البحث في الأصناف، الموردين، العملاء وجهات الصرف، أذونات الإضافة والصرف، التحويلات، كروت حركة الأصناف، وكشوف الحسابات.</div> : <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">{results.length ? results.map(result => <button key={result.key} type="button" onClick={() => go(result.href)} className="flex w-full items-center gap-3 rounded-2xl border border-[#e2eeee] bg-white px-4 py-3 text-right transition hover:border-[#8bcdd2] hover:bg-[#f5fcfc]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f7f6] text-[#0d7180]"><Icon kind={result.icon} /></span><span className="min-w-0 flex-1"><span className="block truncate font-black text-[#102a43]">{result.label}</span><span className="mt-1 block truncate text-xs text-slate-500">{result.description}</span></span></button>) : <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-center text-sm font-bold text-amber-800">لا توجد نتيجة مطابقة. جرّب الاسم أو الكود أو رقم الإذن بصيغة أبسط.</div>}</div>}</div></DialogContent></Dialog></>;
}
