import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

export function warehouseSelectionValidity(value: string, warehouseNames: string[]) {
  const normalizedValue = value.trim();
  if (!normalizedValue) return "";
  return warehouseNames.some(name => name === normalizedValue) ? "" : "اختر مخزناً من القائمة المعتمدة";
}

function enhanceMovementWarehouseFields(warehouseNames: string[]) {
  for (const label of Array.from(document.querySelectorAll("label"))) {
    const text = label.textContent?.trim();
    if (text !== "من مخزن" && text !== "إلى مخزن" && text !== "المخزن") continue;
    const input = label.parentElement?.querySelector("input");
    if (input instanceof HTMLInputElement) {
      input.setAttribute("list", "inventory-warehouse-options");
      input.placeholder = text === "من مخزن" ? "اختر مخزن المصدر" : text === "إلى مخزن" ? "اختر مخزن الوجهة" : "اختر المخزن من القائمة";
      input.required = text === "المخزن" || text === "إلى مخزن";
      input.oninput = () => input.setCustomValidity(warehouseSelectionValidity(input.value, warehouseNames));
      input.onchange = () => input.setCustomValidity(warehouseSelectionValidity(input.value, warehouseNames));
      continue;
    }
    const select = label.parentElement?.querySelector("select");
    if (text !== "المخزن" || !(select instanceof HTMLSelectElement)) continue;
    select.required = true;
    const blankOption = select.querySelector('option[value=""]');
    if (blankOption instanceof HTMLOptionElement) {
      blankOption.textContent = "اختر المخزن";
      blankOption.disabled = true;
    }
    const wrapper = select.parentElement;
    if (!wrapper || wrapper.querySelector("input[data-warehouse-search]")) continue;
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.dataset.warehouseSearch = "true";
    searchInput.placeholder = "ابحث داخل قائمة المخازن...";
    searchInput.setAttribute("aria-label", "بحث سريع داخل قائمة المخازن");
    searchInput.className = "mb-2 h-9 w-full rounded-lg border border-[#b9d4d9] bg-[#f7fbfc] px-3 text-sm text-[#102a43] outline-none placeholder:text-slate-400 focus:border-[#0d7180]";
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLocaleLowerCase("ar-EG");
      for (const option of Array.from(select.options)) {
        if (!option.value) continue;
        option.hidden = Boolean(query) && !option.text.toLocaleLowerCase("ar-EG").includes(query);
      }
    });
    wrapper.insertBefore(searchInput, select);
  }

  for (const select of Array.from(document.querySelectorAll("select"))) {
    const internal = select.querySelector('option[value="transfer"]');
    const returnToWarehouse = select.querySelector('option[value="مرتجع"]');
    const returnFromCustomer = select.querySelector('option[value="مرتجع من عميل"]');
    if (!(internal instanceof HTMLOptionElement) || !(returnToWarehouse instanceof HTMLOptionElement) || !(returnFromCustomer instanceof HTMLOptionElement)) continue;
    if (internal.textContent !== "تحويل داخلي بين المخازن") internal.textContent = "تحويل داخلي بين المخازن";
    if (returnToWarehouse.value !== "مرتجع للمخزن") returnToWarehouse.value = "مرتجع للمخزن";
    if (returnToWarehouse.textContent !== "مرتجع للمخزن") returnToWarehouse.textContent = "مرتجع للمخزن";
  }
}

export default function WarehouseMovementAssistant() {
  const warehouses = trpc.warehouses.listByUsage.useQuery();

  useEffect(() => {
    const warehouseNames = (warehouses.data ?? []).map(warehouse => warehouse.name);
    enhanceMovementWarehouseFields(warehouseNames);
    const observer = new MutationObserver(() => enhanceMovementWarehouseFields(warehouseNames));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [warehouses.data]);

  return <datalist id="inventory-warehouse-options">{(warehouses.data ?? []).map(warehouse => <option key={warehouse.id} value={warehouse.name} />)}</datalist>;
}
