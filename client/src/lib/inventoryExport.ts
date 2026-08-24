export type InventoryExportItem = {
  code: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  unitPrice: number;
  imageUrl?: string | null;
  documentImageUrl?: string | null;
};

export function buildInventoryExportRows(items: InventoryExportItem[]) {
  return items.map(item => ({
    "كود الصنف": item.code,
    "اسم الصنف": item.name,
    "التصنيف": item.category,
    "الوحدة": item.unit,
    "الرصيد الحالي": item.currentStock,
    "حد الطلب": item.reorderLevel,
    "سعر الوحدة": item.unitPrice,
    "قيمة المخزون": Number((item.currentStock * item.unitPrice).toFixed(2)),
    "رابط الصورة": item.imageUrl || "",
  }));
}

export function buildInventoryPdfRows(items: InventoryExportItem[], format: (value: number) => string) {
  return items.map(item => [
    item.code,
    item.name,
    item.category,
    item.unit,
    format(item.currentStock),
    format(item.reorderLevel),
    format(item.unitPrice),
    format(item.currentStock * item.unitPrice),
    item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}" style="width:48px;height:48px;object-fit:cover;border-radius:8px" />` : "—",
  ]);
}
