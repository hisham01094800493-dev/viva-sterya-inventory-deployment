export type InventoryFilterItem = {
  id: number;
  name: string;
  code: string;
  category?: string | null;
  currentStock: number | string;
  reorderLevel: number | string;
  unit?: string | null;
  incomingStock?: number | string;
  outgoingStock?: number | string;
  unitPrice?: number | string;
  imageUrl?: string | null;
};

export type StockFilter = "all" | "low" | "healthy";
export type ItemSort = "name" | "code" | "stock";

export function filterInventoryItems(
  items: InventoryFilterItem[],
  searchTerm: string,
  categoryFilter: string,
  stockFilter: StockFilter,
  sortBy: ItemSort,
) {
  return [...items]
    .filter(item => {
      const normalizedSearch = searchTerm.trim().toLocaleLowerCase("ar");
      const searchableText = `${item.code} ${item.name}`.toLocaleLowerCase("ar");
      const category = item.category || "بدون تصنيف";
      const low = Number(item.reorderLevel) > 0 ? Number(item.currentStock) <= Number(item.reorderLevel) : Number(item.currentStock) <= 0;
      return (!normalizedSearch || searchableText.includes(normalizedSearch)) && (categoryFilter === "all" || category === categoryFilter) && (stockFilter === "all" || (stockFilter === "low" ? low : !low));
    })
    .sort((a, b) => {
      if (sortBy === "stock") return Number(b.currentStock) - Number(a.currentStock);
      if (sortBy === "code") return a.code.localeCompare(b.code, "ar");
      return a.name.localeCompare(b.name, "ar");
    });
}
