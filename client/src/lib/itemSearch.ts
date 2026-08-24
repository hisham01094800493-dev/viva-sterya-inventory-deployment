export const ITEM_SEARCH_DEBOUNCE_MS = 220;

export function normalizeItemSearch(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function createItemSearchInput(value: string) {
  const search = normalizeItemSearch(value);
  return search ? { search } : undefined;
}
