export const ITEM_CARD_UNIT_PRICE_KEY = "smart-inventory-item-card-show-unit-price";
export const ITEM_CARD_TOTAL_VALUE_KEY = "smart-inventory-item-card-show-total-value";
export const ITEM_CARD_MOVEMENT_FILTER_KEY = "smart-inventory-item-card-movement-filter";
export const ITEM_CARD_PERMIT_COLUMN_KEY = "smart-inventory-item-card-show-permit-column";
export const ITEM_CARD_MOVEMENT_FILTERS = ["all", "إضافة", "صرف", "مرتجع", "تحويل"] as const;
export type ItemCardMovementFilterPreference = typeof ITEM_CARD_MOVEMENT_FILTERS[number];

export function readItemCardColumnPreference(value: string | null, fallback = true) {
  if (value === null) return fallback;
  return value !== "0";
}

export function writeItemCardColumnPreference(storage: Pick<Storage, "setItem">, key: string, enabled: boolean) {
  storage.setItem(key, enabled ? "1" : "0");
}

export function readItemCardMovementFilter(value: string | null): ItemCardMovementFilterPreference {
  return ITEM_CARD_MOVEMENT_FILTERS.includes(value as ItemCardMovementFilterPreference) ? value as ItemCardMovementFilterPreference : "all";
}

export function writeItemCardMovementFilter(storage: Pick<Storage, "setItem">, value: ItemCardMovementFilterPreference) {
  storage.setItem(ITEM_CARD_MOVEMENT_FILTER_KEY, value);
}

