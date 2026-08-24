import { readFileSync, writeFileSync } from "node:fs";

const path = "/home/ubuntu/viva-sterya-inventory/client/src/pages/InventoryPages.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`لم يتم العثور على موضع ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  'const [movementTableZoom, setMovementTableZoom] = useState(1);',
  'const [movementTableZoom, setMovementTableZoom] = useState(1);\n  const [movementFinancialPreferenceVisible, setMovementFinancialPreferenceVisible] = useState(false);',
  "حالة تفضيل أعمدة الحركات",
);
replaceOnce(
  'const preferences = trpc.preferences.get.useQuery();',
  'const permissions = trpc.permissions.mine.useQuery();\n  const preferences = trpc.preferences.get.useQuery();',
  "استعلام صلاحية الحركات",
);
replaceOnce(
  'const totalRows = query.data?.total ?? 0; const totalQuantity = query.data?.totalQuantity ?? 0; const totalValue = query.data?.totalValue ?? 0; const totalScopeLabel = getMovementTotalsScopeLabel(appliedFilters); const pageCount = query.data?.pageCount ?? 1;',
  'const totalRows = query.data?.total ?? 0; const totalQuantity = query.data?.totalQuantity ?? 0; const totalValue = query.data?.totalValue ?? 0; const totalScopeLabel = getMovementTotalsScopeLabel(appliedFilters); const pageCount = query.data?.pageCount ?? 1;\n  const canViewMovementFinancialDetails = permissions.data?.allowedReports.includes("warehouse-financial-details") ?? false;\n  const showMovementFinancialDetails = canViewMovementFinancialDetails && movementFinancialPreferenceVisible;',
  "شرط رسم أعمدة الحركات",
);
replaceOnce(
  'function saveColumnOrder(order: ExportColumnKey[]) { const currentOrders = preferences.data?.reportColumnOrder ?? {}; updatePreferences.mutate({ quickActions: preferences.data?.quickActions ?? ["/additions", "/disbursements", "/transfers"], hapticEnabled: preferences.data?.hapticEnabled ?? true, reportColumnOrder: { ...currentOrders, [columnPreferenceKey]: order } }); }',
  'function saveColumnOrder(order: ExportColumnKey[]) { const currentOrders = preferences.data?.reportColumnOrder ?? {}; updatePreferences.mutate({ quickActions: preferences.data?.quickActions ?? ["/additions", "/disbursements", "/transfers"], hapticEnabled: preferences.data?.hapticEnabled ?? true, reportColumnOrder: { ...currentOrders, [columnPreferenceKey]: order } }); }\n  async function toggleMovementFinancialDetails() { const next = !movementFinancialPreferenceVisible; setMovementFinancialPreferenceVisible(next); try { await updatePreferences.mutateAsync({ quickActions: preferences.data?.quickActions ?? ["/additions", "/disbursements", "/transfers"], hapticEnabled: preferences.data?.hapticEnabled ?? true, reportColumnOrder: { ...(preferences.data?.reportColumnOrder ?? {}), ["movement-financial-columns-v1"]: next ? ["visible"] : [] } }); } catch (error: any) { setMovementFinancialPreferenceVisible(!next); toast.error(error?.message || "تعذر حفظ اختيار التفاصيل المالية"); } }',
  "تبديل التفاصيل المالية",
);
replaceOnce(
  'useEffect(() => { const saved = preferences.data?.reportColumnOrder?.[columnPreferenceKey] ?? []; const normalized = saved.filter(column => movementColumns.includes(column as never)) as ExportColumnKey[]; if (normalized.length) setSelectedPdfColumns(normalized); }, [preferences.data, columnPreferenceKey]);',
  'useEffect(() => { const saved = preferences.data?.reportColumnOrder?.[columnPreferenceKey] ?? []; const normalized = saved.filter(column => movementColumns.includes(column as never)) as ExportColumnKey[]; if (normalized.length) setSelectedPdfColumns(normalized); }, [preferences.data, columnPreferenceKey]);\n  useEffect(() => { const saved = preferences.data?.reportColumnOrder?.["movement-financial-columns-v1"] ?? []; setMovementFinancialPreferenceVisible(canViewMovementFinancialDetails && saved.includes("visible")); }, [canViewMovementFinancialDetails, preferences.data?.reportColumnOrder]);',
  "تحميل تفضيل أعمدة الحركات",
);
replaceOnce(
  '<th className="px-4 py-4">سعر الوحدة</th><th className="px-4 py-4">الإجمالي</th>',
  '{showMovementFinancialDetails ? <><th className="px-4 py-4">سعر الوحدة</th><th className="px-4 py-4">الإجمالي</th></> : null}',
  "رؤوس أعمدة الحركات",
);
replaceOnce(
  '<td className="px-4 py-4 text-sm font-bold text-[#0d4f62]">{formatQuantity(row.unitPrice)} ج.م</td><td className="px-4 py-4 text-sm font-black text-[#102a43]">{formatQuantity(row.totalValue)} ج.م</td>',
  '{showMovementFinancialDetails ? <><td className="px-4 py-4 text-sm font-bold text-[#0d4f62]">{formatQuantity(row.unitPrice)} ج.م</td><td className="px-4 py-4 text-sm font-black text-[#102a43]">{formatQuantity(row.totalValue)} ج.م</td></> : null}',
  "خلايا أعمدة الحركات",
);

writeFileSync(path, source, "utf8");
