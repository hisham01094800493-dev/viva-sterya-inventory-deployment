import { describe, expect, it } from "vitest";
import { buildVoiceStockQueryResult, consumeVoiceRateLimit, normalizeVoiceStockText } from "./voiceStockQuery";

const warehouses = [{ id: 1, name: "المخزن الرئيسي", slot: 1 }, { id: 2, name: "مخزن الفرع", slot: 2 }];
const items = [
  { id: 10, code: "10005", name: "أسمنت", unit: "شيكارة", warehouseId: 1, currentStock: "99.000" },
  { id: 11, code: "10006", name: "أسمنت أبيض", unit: "شيكارة", warehouseId: 2, currentStock: "20.000" },
];
const balances = [
  { itemId: 10, warehouseId: 1, currentStock: "12.345" },
  { itemId: 10, warehouseId: 2, currentStock: "4.005" },
  { itemId: 11, warehouseId: 2, currentStock: "8.000" },
];

describe("استعلام الرصيد الصوتي", () => {
  it("يوحد الحروف العربية والأرقام والمسافات", () => {
    expect(normalizeVoiceStockText("  كَام رصيد الأسمنت في المخزن ٢  ")).toBe("كام رصيد الاسمنت في المخزن 2");
  });
  it("يعطي أولوية للتطابق بالكود ويعيد الرصيد scaled بدقة", () => {
    const result = buildVoiceStockQueryResult({ query: "رصيد 10005", items, balances, warehouses, allowedWarehouseIds: [] });
    expect(result.ambiguous).toBe(false);
    expect(result.matches[0]).toMatchObject({ code: "10005", totalCurrentStock: "16.350" });
    expect(result.matches[0].warehouseBalances).toHaveLength(2);
  });
  it("يطلب الاختيار عند وجود أكثر من مرشح", () => {
    const result = buildVoiceStockQueryResult({ query: "رصيد الاسمنت", items, balances, warehouses, allowedWarehouseIds: [] });
    expect(result.ambiguous).toBe(true);
    expect(result.matches.map(item => item.code)).toEqual(["10005", "10006"]);
  });
  it("يطبق اسم المخزن والمخازن المسموحة قبل إرجاع الرصيد", () => {
    const result = buildVoiceStockQueryResult({ query: "رصيد الأسمنت في المخزن الرئيسي", items, balances, warehouses, allowedWarehouseIds: [1] });
    expect(result.warehouseId).toBe(1);
    expect(result.matches[0].warehouseBalances.map(row => row.warehouseId)).toEqual([1]);
    const restricted = buildVoiceStockQueryResult({ query: "رصيد الأسمنت", items, balances, warehouses, allowedWarehouseIds: [1] });
    expect(restricted.matches[0].warehouseBalances.map(row => row.warehouseId)).toEqual([1]);
  });
  it("لا يعيد أي أعمدة مالية", () => {
    const result = buildVoiceStockQueryResult({ query: "رصيد 10005", items, balances, warehouses, allowedWarehouseIds: [] });
    expect(result.matches[0]).not.toHaveProperty("unitPrice");
    expect(result.matches[0]).not.toHaveProperty("totalValue");
  });
  it("يحد الاستهلاك إلى 20 طلباً في الدقيقة لكل مستخدم", () => {
    const store = new Map<number, number[]>();
    for (let index = 0; index < 20; index += 1) expect(consumeVoiceRateLimit(store, 7, 1000 + index)).toBe(true);
    expect(consumeVoiceRateLimit(store, 7, 1019)).toBe(false);
    expect(consumeVoiceRateLimit(store, 8, 1019)).toBe(true);
    expect(consumeVoiceRateLimit(store, 7, 61_100)).toBe(true);
  });
});
