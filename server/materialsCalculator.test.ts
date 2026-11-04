import { describe, expect, it } from "vitest";
import {
  calculateCeramicMaterials,
  calculateRebarMaterials,
} from "../client/src/lib/materialsCalculator";

describe("حاسبة خامات السيراميك", () => {
  it("تحسب المساحة والهالك وتقريب الكمية إلى كراتين كاملة", () => {
    const result = calculateCeramicMaterials({
      tileCount: 100,
      tilesPerCarton: 4,
      areaPerTile: 0.36,
      wastagePercent: 5,
    });

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      requestedTileCount: 100,
      wastageTileCount: 5,
      targetTileCount: 105,
      cartonsRequired: 27,
      suppliedTileCount: 108,
      tilesFromCartonRounding: 3,
      baseAreaSquareMeters: 36,
    });
    expect(result?.wastageAreaSquareMeters).toBeCloseTo(1.8);
    expect(result?.targetAreaSquareMeters).toBeCloseTo(37.8);
    expect(result?.suppliedAreaSquareMeters).toBeCloseTo(38.88);
    expect(result?.cartonRoundingAreaSquareMeters).toBeCloseTo(1.08);
  });

  it("تستخرج مساحة البلاطة من مساحة الكرتونة وعدد البلاطات فيها", () => {
    const result = calculateCeramicMaterials({
      tileCount: 100,
      tilesPerCarton: 4,
      areaPerCarton: 1.44,
      wastagePercent: 0,
    });

    expect(result?.baseAreaSquareMeters).toBeCloseTo(36);
    expect(result?.cartonsRequired).toBe(25);
    expect(result?.suppliedTileCount).toBe(100);
  });

  it("لا تعرض نتيجة إذا لم تتوفر بيانات تكفي لحساب المساحة أو العدد", () => {
    expect(
      calculateCeramicMaterials({ tileCount: 0, areaPerTile: 0.36 })
    ).toBeNull();
    expect(
      calculateCeramicMaterials({ tileCount: 100, areaPerCarton: 1.44 })
    ).toBeNull();
  });
});

describe("حاسبة خامات الحديد", () => {
  it("تحسب طول ووزن 20 سيخاً قطر 16 مم بطول 12 متراً", () => {
    const result = calculateRebarMaterials({
      diameterMm: 16,
      barCount: 20,
      barLengthMeters: 12,
    });

    expect(result).not.toBeNull();
    expect(result?.requestedLengthMeters).toBe(240);
    expect(result?.totalBarCount).toBe(20);
    expect(result?.weightPerMeterKg).toBeCloseTo((16 * 16) / 162);
    expect(result?.totalWeightKg).toBeCloseTo(379.259259, 5);
    expect(result?.totalWeightTons).toBeCloseTo(0.379259259, 7);
  });

  it("تضيف الهالك بأسياخ كاملة مع إظهار الوزن الإضافي", () => {
    const result = calculateRebarMaterials({
      diameterMm: 16,
      barCount: 20,
      barLengthMeters: 12,
      wastagePercent: 10,
    });

    expect(result?.extraBarCount).toBe(2);
    expect(result?.totalBarCount).toBe(22);
    expect(result?.wastageLengthMeters).toBe(24);
    expect(result?.totalLengthMeters).toBe(264);
    expect(result?.totalWeightKg).toBeCloseTo(((16 * 16) / 162) * 264);
  });

  it("يستخدم الوزن النظري اليدوي إذا تم إدخاله ويرفض المدخلات غير الصحيحة", () => {
    const result = calculateRebarMaterials({
      diameterMm: 16,
      barCount: 2,
      barLengthMeters: 12,
      weightPerMeterKg: 1.6,
    });
    expect(result?.totalWeightKg).toBeCloseTo(38.4);
    expect(
      calculateRebarMaterials({
        diameterMm: 0,
        barCount: 2,
        barLengthMeters: 12,
      })
    ).toBeNull();
    expect(
      calculateRebarMaterials({
        diameterMm: 16,
        barCount: 1.5,
        barLengthMeters: 12,
      })
    ).toBeNull();
  });
});
