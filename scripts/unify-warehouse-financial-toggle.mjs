import { readFileSync, writeFileSync } from "node:fs";

const path = "/home/ubuntu/viva-sterya-inventory/client/src/pages/WarehousesSuppliersPages.tsx";
const source = readFileSync(path, "utf8");
const from = 'disabled={updatePreferences.isPending || permissions.isLoading || preferences.isLoading} className="rounded-xl border-[#b9d4d9] text-xs font-black text-[#0d4f62]"';
const to = 'disabled={updatePreferences.isPending || permissions.isLoading || preferences.isLoading} aria-pressed={showFinancialDetails} className="movement-financial-toggle rounded-xl text-xs font-black"';

if (!source.includes(from)) throw new Error("لم يتم العثور على زر التفاصيل المالية في صفحة المخازن");
writeFileSync(path, source.replace(from, to), "utf8");
