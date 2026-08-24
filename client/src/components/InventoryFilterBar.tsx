import { Filter, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

type InventoryFilterBarProps = {
  searchInput: string;
  categoryFilter: string;
  stockFilter: "all" | "low" | "healthy";
  sortBy: "name" | "code" | "stock";
  categories: string[];
  visibleCount: number;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStockChange: (value: "all" | "low" | "healthy") => void;
  onSortChange: (value: "name" | "code" | "stock") => void;
};

export function InventoryFilterBar({ searchInput, categoryFilter, stockFilter, sortBy, categories, visibleCount, onSearchChange, onCategoryChange, onStockChange, onSortChange }: InventoryFilterBarProps) {
  return <div className="flex flex-col gap-3 border-b border-[#edf2f5] p-5 md:flex-row md:items-center md:justify-between">
    <div className="relative w-full max-w-md">
      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input value={searchInput} onChange={event => onSearchChange(event.target.value)} placeholder="بحث سريع بالكود أو اسم الصنف..." aria-label="بحث سريع في الأصناف" className="h-11 rounded-xl border-[#dce7ee] pr-10 pl-10" />
      {searchInput ? <button type="button" onClick={() => onSearchChange("")} aria-label="مسح البحث" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-[#e8f1f2] hover:text-[#0d4f62]"><X className="h-4 w-4" /></button> : null}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="تصفية حسب التصنيف" value={categoryFilter} onChange={event => onCategoryChange(event.target.value)} className="h-10 rounded-xl border border-[#dce7ee] bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option value="all">كل التصنيفات</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select>
      <select aria-label="تصفية حسب الحالة" value={stockFilter} onChange={event => onStockChange(event.target.value as "all" | "low" | "healthy")} className="h-10 rounded-xl border border-[#dce7ee] bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option value="all">كل الحالات</option><option value="low">منخفض المخزون</option><option value="healthy">مخزون مستقر</option></select>
      <select aria-label="ترتيب الأصناف" value={sortBy} onChange={event => onSortChange(event.target.value as "name" | "code" | "stock")} className="h-10 rounded-xl border border-[#dce7ee] bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option value="name">ترتيب حسب الاسم</option><option value="code">ترتيب حسب الكود</option><option value="stock">ترتيب حسب الرصيد</option></select>
      <span className="flex items-center gap-2 text-xs font-bold text-slate-400"><Filter className="h-4 w-4" />{visibleCount} صنف</span>
    </div>
  </div>;
}
