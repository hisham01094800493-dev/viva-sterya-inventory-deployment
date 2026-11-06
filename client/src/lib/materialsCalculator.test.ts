import { describe, expect, it } from "vitest";
import {
  calculateCeramicPallets,
  calculateCeramicRequirement,
} from "./materialsCalculator";

describe("ceramic area and package calculations", () => {
  it("converts 210 m² of 30×60 cm tiles into whole tiles and cartons", () => {
    const result = calculateCeramicRequirement({
      areaSquareMeters: 210,
      areaPerTile: (30 * 60) / 10_000,
      tilesPerCarton: 8,
      wastagePercent: 5,
    });

    expect(result).toMatchObject({
      requestedTileCount: 1167,
      wastageTileCount: 59,
      targetTileCount: 1226,
      cartonsRequired: 154,
      suppliedTileCount: 1232,
      suppliedAreaSquareMeters: 221.76,
    });
  });

  it("rounds the required cartons up to complete pallets and reports surplus cartons", () => {
    expect(calculateCeramicPallets(154, 48)).toEqual({
      cartonsRequired: 154,
      cartonsPerPallet: 48,
      palletsRequired: 4,
      suppliedCartons: 192,
      extraCartons: 38,
    });
  });

  it("returns no pallet estimate until the carton count per pallet is known", () => {
    expect(calculateCeramicPallets(154, null)).toBeNull();
  });

  it("rejects invalid area, tile size, package counts, and wastage", () => {
    expect(calculateCeramicRequirement({ areaSquareMeters: 0, areaPerTile: 0.18 })).toBeNull();
    expect(calculateCeramicRequirement({ areaSquareMeters: 10, areaPerTile: 0 })).toBeNull();
    expect(calculateCeramicRequirement({ areaSquareMeters: 10, areaPerTile: 0.18, tilesPerCarton: 2.5 })).toBeNull();
    expect(calculateCeramicRequirement({ areaSquareMeters: 10, areaPerTile: 0.18, wastagePercent: 101 })).toBeNull();
  });
});
