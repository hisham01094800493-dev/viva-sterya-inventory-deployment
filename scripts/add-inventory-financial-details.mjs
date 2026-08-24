import { readFileSync, writeFileSync } from "node:fs";

const path = "/home/ubuntu/viva-sterya-inventory/client/src/pages/InventoryPages.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`لم يتم العثور على ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  'const remove = trpc.items.delete.useMutation();',
  'const remove = trpc.items.delete.useMutation();\n  const permissions = trpc.permissions.mine.useQuery();\n  const preferences = trpc.preferences.get.useQuery();\n  const updatePreferences = trpc.preferences.update.useMutation();\n  const [inventoryFinancialPreferenceVisible, setInventoryFinancialPreferenceVisible] = useState(false);\n  const canViewInventoryFinancialDetails = permissions.data?.allowedReports.includes("warehouse-financial-details") ?? false;\n  const showInventoryFinancialDetails = canViewInventoryFinancialDetails && inventoryFinancialPreferenceVisible;\n  useEffect(() => { const saved = preferences.data?.reportColumnOrder?.["inventory-financial-details-v1"] ?? []; setInventoryFinancialPreferenceVisible(canViewInventoryFinancialDetails && saved.includes("visible")); }, [canViewInventoryFinancialDetails, preferences.data?.reportColumnOrder]);\n  async function toggleInventoryFinancialDetails() { const next = !inventoryFinancialPreferenceVisible; setInventoryFinancialPreferenceVisible(next); try { await updatePreferences.mutateAsync({ quickActions: preferences.data?.quickActions ?? ["/additions", "/disbursements", "/transfers"], hapticEnabled: preferences.data?.hapticEnabled ?? true, reportColumnOrder: { ...(preferences.data?.reportColumnOrder ?? {}), ["inventory-financial-details-v1"]: next ? ["visible"] : [] } }); } catch (error: any) { setInventoryFinancialPreferenceVisible(!next); toast.error(error?.message || "تعذر حفظ اختيار التفاصيل المالية"); } }',
  "استعلامات التفاصيل المالية في صفحة الأصناف",
);
replaceOnce(
  'action={<div className="flex flex-wrap gap-2"><Button variant="outline"',
  'action={<div className="flex flex-wrap gap-2">{canViewInventoryFinancialDetails ? <Button type="button" variant="outline" onClick={() => void toggleInventoryFinancialDetails()} disabled={updatePreferences.isPending || permissions.isLoading || preferences.isLoading} aria-pressed={showInventoryFinancialDetails} className="movement-financial-toggle h-11 rounded-xl px-4 font-bold"><Eye className="ml-2 h-4 w-4" />{showInventoryFinancialDetails ? "إخفاء التفاصيل المالية" : "إظهار التفاصيل المالية"}</Button> : null}<Button variant="outline"',
  "زر التفاصيل المالية في عنوان الأصناف",
);
replaceOnce(
  '<MobileItemCards items={visibleItems}',
  '<MobileItemCards items={visibleItems} showFinancialDetails={showInventoryFinancialDetails}',
  "بطاقات الأصناف المحمولة",
);
replaceOnce(
  '<th className="px-4 py-4">السعر</th>',
  '{showInventoryFinancialDetails ? <th className="px-4 py-4">السعر</th> : null}',
  "عنوان سعر الوحدة",
);
replaceOnce(
  '<td className="px-4 py-4 text-sm font-bold text-[#0d4f62]">{formatQuantity(item.unitPrice)} <span className="text-[10px] font-normal text-slate-400">ج.م</span></td>',
  '{showInventoryFinancialDetails ? <td className="px-4 py-4 text-sm font-bold text-[#0d4f62]">{formatQuantity(item.unitPrice)} <span className="text-[10px] font-normal text-slate-400">ج.م</span></td> : null}',
  "خلية سعر الوحدة",
);
replaceOnce(
  'function MobileItemCards({ items, onEdit, onDelete, onCard, deleting }: { items: any[]; onEdit:',
  'function MobileItemCards({ items, showFinancialDetails, onEdit, onDelete, onCard, deleting }: { items: any[]; showFinancialDetails: boolean; onEdit:',
  "وسيط بطاقات الأصناف",
);
replaceOnce(
  '<div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-[#f7fbfc] p-2"><span className="block text-slate-400">الرصيد الحالي</span><strong className={`mt-1 block text-sm ${low ? "text-[#bd5147]" : "text-[#0d806c]"}`}>{formatQuantity(item.currentStock)} {item.unit || "وحدة"}</strong></div><div className="rounded-xl bg-[#f7fbfc] p-2"><span className="block text-slate-400">سعر الوحدة</span><strong className="mt-1 block text-sm text-[#0d4f62]">{formatQuantity(item.unitPrice)} ج.م</strong></div></div>',
  '<div className={`mt-4 grid gap-2 text-xs ${showFinancialDetails ? "grid-cols-2" : "grid-cols-1"}`}><div className="rounded-xl bg-[#f7fbfc] p-2"><span className="block text-slate-400">الرصيد الحالي</span><strong className={`mt-1 block text-sm ${low ? "text-[#bd5147]" : "text-[#0d806c]"}`}>{formatQuantity(item.currentStock)} {item.unit || "وحدة"}</strong></div>{showFinancialDetails ? <div className="rounded-xl bg-[#f7fbfc] p-2"><span className="block text-slate-400">سعر الوحدة</span><strong className="mt-1 block text-sm text-[#0d4f62]">{formatQuantity(item.unitPrice)} ج.م</strong></div> : null}</div>',
  "بطاقة سعر الوحدة المحمولة",
);

writeFileSync(path, source, "utf8");
