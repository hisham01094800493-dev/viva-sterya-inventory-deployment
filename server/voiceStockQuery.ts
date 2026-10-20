import { fromScaled, toScaled } from "./db/scale";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const DIACRITICS = /[\u064B-\u065F\u0670]/g;
const STOP_WORDS = new Set([
  "رصيد", "الرصيد", "مخزون", "المخزون", "كم", "كام", "كمية", "كميه",
  "في", "فى", "من", "داخل", "ب", "ال", "المخزن", "مخزن", "مخازن",
  "اجمالي", "إجمالي", "الاجمالي", "الإجمالي", "هو", "هي", "لصنف", "صنف",
]);

export type VoiceStockWarehouse = { id: number; name: string; slot?: number };
export type VoiceStockItem = { id: number; code: string; name: string; unit?: string | null; warehouseId?: number | null; currentStock?: string | number | null };
export type VoiceStockBalance = { itemId: number; warehouseId: number; currentStock: string | number | null };
export type VoiceStockMatch = {
  id: number;
  code: string;
  name: string;
  unit: string | null;
  totalCurrentStock: string;
  warehouseBalances: Array<{ warehouseId: number; name: string; slot?: number; currentStock: string }>;
  score: number;
};
export type VoiceStockQueryResult = {
  matches: VoiceStockMatch[];
  ambiguous: boolean;
  normalizedQuery: string;
  warehouseId: number | null;
  warehouseName: string | null;
};

export function normalizeVoiceStockText(value: string) {
  return value
    .normalize("NFKC")
    .replace(DIACRITICS, "")
    .replace(/[ـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
    .toLocaleLowerCase("ar")
    .replace(/[^\u0600-\u06FF\u0750-\u077F\w\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalizeVoiceStockText(value)
    .split(" ")
    .filter(Boolean)
    .map(token => token.replace(/^ال(?=.{2,})/, ""))
    .filter(token => !STOP_WORDS.has(token));
}

export function findMentionedWarehouse(query: string, warehouses: VoiceStockWarehouse[]) {
  const normalizedQuery = normalizeVoiceStockText(query);
  return [...warehouses]
    .sort((left, right) => normalizeVoiceStockText(right.name).length - normalizeVoiceStockText(left.name).length)
    .find(warehouse => {
      const name = normalizeVoiceStockText(warehouse.name);
      return name.length > 1 && normalizedQuery.includes(name);
    }) ?? null;
}

function scoreItem(query: string, item: VoiceStockItem) {
  const normalizedQuery = normalizeVoiceStockText(query);
  const code = normalizeVoiceStockText(item.code);
  const name = normalizeVoiceStockText(item.name);
  const queryTokens = tokens(query);
  const nameTokens = new Set(tokens(item.name));
  if (queryTokens.some(token => code === token)) return 1200;
  if (name === normalizedQuery || queryTokens.some(token => name === token)) return 1100;
  if (queryTokens.some(token => code.includes(token) && token.length >= 2)) return 900;
  if (queryTokens.some(token => name.includes(token) && token.length >= 2)) return 850;
  const overlap = queryTokens.filter(token => nameTokens.has(token)).length;
  const allWordsMatch = queryTokens.length > 0 && queryTokens.every(token => name.includes(token));
  if (allWordsMatch) return 700 + overlap * 20;
  return overlap * 100;
}

export function consumeVoiceRateLimit(store: Map<number, number[]>, userId: number, now = Date.now(), max = 20, windowMs = 60_000) {
  const recent = (store.get(userId) ?? []).filter(timestamp => now - timestamp < windowMs);
  if (recent.length >= max) {
    store.set(userId, recent);
    return false;
  }
  recent.push(now);
  store.set(userId, recent);
  return true;
}

type BuildInput = {
  query: string;
  items: VoiceStockItem[];
  balances: VoiceStockBalance[];
  warehouses: VoiceStockWarehouse[];
  allowedWarehouseIds: number[];
};

export function buildVoiceStockQueryResult(input: BuildInput): VoiceStockQueryResult {
  const normalizedQuery = normalizeVoiceStockText(input.query).slice(0, 200);
  const visibleWarehouses = input.allowedWarehouseIds.length
    ? input.warehouses.filter(warehouse => input.allowedWarehouseIds.includes(warehouse.id))
    : input.warehouses;
  const mentionedWarehouse = findMentionedWarehouse(normalizedQuery, visibleWarehouses);
  const visibleWarehouseIds = mentionedWarehouse ? [mentionedWarehouse.id] : visibleWarehouses.map(warehouse => warehouse.id);
  const warehouseById = new Map(visibleWarehouses.map(warehouse => [warehouse.id, warehouse]));
  const balancesByItem = new Map<number, VoiceStockBalance[]>();
  for (const balance of input.balances) {
    if (!visibleWarehouseIds.includes(balance.warehouseId)) continue;
    const rows = balancesByItem.get(balance.itemId) ?? [];
    rows.push(balance);
    balancesByItem.set(balance.itemId, rows);
  }
  const queryWithoutWarehouse = mentionedWarehouse
    ? normalizedQuery.replace(normalizeVoiceStockText(mentionedWarehouse.name), " ").replace(/\s+/g, " ").trim()
    : normalizedQuery;
  const candidates = input.items
    .filter(item => {
      const balanceRows = balancesByItem.get(item.id) ?? [];
      if (balanceRows.length) return true;
      return item.warehouseId == null || visibleWarehouseIds.includes(item.warehouseId);
    })
    .map(item => ({ item, score: scoreItem(queryWithoutWarehouse, item) }))
    .filter(row => row.score > 0)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name, "ar"))
    .slice(0, 5);
  const matches = candidates.map(({ item, score }) => {
    const balanceRows = balancesByItem.get(item.id) ?? [];
    const warehouseBalances = balanceRows.length
      ? balanceRows.map(balance => ({
          warehouseId: balance.warehouseId,
          name: warehouseById.get(balance.warehouseId)?.name ?? `مخزن ${balance.warehouseId}`,
          slot: warehouseById.get(balance.warehouseId)?.slot,
          currentStock: fromScaled(toScaled(balance.currentStock)),
        }))
      : item.warehouseId != null && visibleWarehouseIds.includes(item.warehouseId)
        ? [{
            warehouseId: item.warehouseId,
            name: warehouseById.get(item.warehouseId)?.name ?? `مخزن ${item.warehouseId}`,
            slot: warehouseById.get(item.warehouseId)?.slot,
            currentStock: fromScaled(toScaled(item.currentStock)),
          }]
        : [];
    const total = warehouseBalances.reduce((sum, balance) => sum + toScaled(balance.currentStock), 0);
    return { id: item.id, code: item.code, name: item.name, unit: item.unit ?? null, totalCurrentStock: fromScaled(total), warehouseBalances, score };
  });
  const topScore = candidates[0]?.score ?? 0;
  const secondScore = candidates[1]?.score ?? 0;
  return {
    matches,
    ambiguous: matches.length !== 1 || topScore < 700 || secondScore >= topScore - 120,
    normalizedQuery,
    warehouseId: mentionedWarehouse?.id ?? null,
    warehouseName: mentionedWarehouse?.name ?? null,
  };
}
