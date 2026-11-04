export type CeramicCalculationInput = {
  tileCount: number;
  tilesPerCarton?: number | null;
  areaPerTile?: number | null;
  areaPerCarton?: number | null;
  wastagePercent?: number | null;
};

export type CeramicCalculation = {
  requestedTileCount: number;
  wastageTileCount: number;
  targetTileCount: number;
  tilesPerCarton: number | null;
  cartonsRequired: number | null;
  suppliedTileCount: number;
  tilesFromCartonRounding: number;
  baseAreaSquareMeters: number;
  wastageAreaSquareMeters: number;
  targetAreaSquareMeters: number;
  suppliedAreaSquareMeters: number;
  cartonRoundingAreaSquareMeters: number;
};

export type RebarCalculationInput = {
  diameterMm: number;
  barCount: number;
  barLengthMeters: number;
  wastagePercent?: number | null;
  weightPerMeterKg?: number | null;
};

export type RebarCalculation = {
  diameterMm: number;
  requestedBarCount: number;
  extraBarCount: number;
  totalBarCount: number;
  barLengthMeters: number;
  requestedLengthMeters: number;
  wastageLengthMeters: number;
  totalLengthMeters: number;
  weightPerMeterKg: number;
  requestedWeightKg: number;
  wastageWeightKg: number;
  totalWeightKg: number;
  totalWeightTons: number;
};

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isValidPercent = (value: number | null | undefined) =>
  value == null || (Number.isFinite(value) && value >= 0 && value <= 100);

const normalizePercent = (value: number | null | undefined) => value ?? 0;

/**
 * Computes the material amount for ceramic tiles.
 * `areaPerTile` is in m²/tile; `areaPerCarton` is in m²/carton.
 * Carton rounding is reported separately from the requested wastage allowance.
 */
export function calculateCeramicMaterials(
  input: CeramicCalculationInput
): CeramicCalculation | null {
  const tileCount = input.tileCount;
  if (
    !Number.isInteger(tileCount) ||
    tileCount <= 0 ||
    !isValidPercent(input.wastagePercent)
  )
    return null;
  if (
    input.tilesPerCarton != null &&
    input.tilesPerCarton !== 0 &&
    (!Number.isInteger(input.tilesPerCarton) || input.tilesPerCarton < 1)
  )
    return null;

  const tilesPerCarton = isPositiveFinite(input.tilesPerCarton)
    ? input.tilesPerCarton
    : null;
  const areaPerTile = isPositiveFinite(input.areaPerTile)
    ? input.areaPerTile
    : null;
  const areaPerCarton = isPositiveFinite(input.areaPerCarton)
    ? input.areaPerCarton
    : null;

  let effectiveAreaPerTile: number;
  if (areaPerTile !== null) {
    effectiveAreaPerTile = areaPerTile;
  } else if (areaPerCarton !== null && tilesPerCarton !== null) {
    effectiveAreaPerTile = areaPerCarton / tilesPerCarton;
  } else {
    return null;
  }

  const wastagePercent = normalizePercent(input.wastagePercent);
  const wastageTileCount = Math.ceil((tileCount * wastagePercent) / 100);
  const targetTileCount = tileCount + wastageTileCount;
  const cartonsRequired =
    tilesPerCarton === null
      ? null
      : Math.ceil(targetTileCount / tilesPerCarton);
  const suppliedTileCount =
    cartonsRequired === null || tilesPerCarton === null
      ? targetTileCount
      : cartonsRequired * tilesPerCarton;
  const tilesFromCartonRounding = suppliedTileCount - targetTileCount;
  const baseAreaSquareMeters = tileCount * effectiveAreaPerTile;
  const wastageAreaSquareMeters = wastageTileCount * effectiveAreaPerTile;
  const targetAreaSquareMeters = baseAreaSquareMeters + wastageAreaSquareMeters;
  const suppliedAreaSquareMeters = suppliedTileCount * effectiveAreaPerTile;

  return {
    requestedTileCount: tileCount,
    wastageTileCount,
    targetTileCount,
    tilesPerCarton,
    cartonsRequired,
    suppliedTileCount,
    tilesFromCartonRounding,
    baseAreaSquareMeters,
    wastageAreaSquareMeters,
    targetAreaSquareMeters,
    suppliedAreaSquareMeters,
    cartonRoundingAreaSquareMeters:
      tilesFromCartonRounding * effectiveAreaPerTile,
  };
}

/**
 * Calculates theoretical rebar mass using the common approximation d²/162 kg/m.
 * An optional supplied kg/m value overrides that approximation.
 */
export function calculateRebarMaterials(
  input: RebarCalculationInput
): RebarCalculation | null {
  const { diameterMm, barCount, barLengthMeters } = input;
  if (
    !isPositiveFinite(diameterMm) ||
    !Number.isInteger(barCount) ||
    barCount <= 0 ||
    !isPositiveFinite(barLengthMeters) ||
    !isValidPercent(input.wastagePercent)
  ) {
    return null;
  }
  if (
    input.weightPerMeterKg != null &&
    !isPositiveFinite(input.weightPerMeterKg)
  )
    return null;

  const wastagePercent = normalizePercent(input.wastagePercent);
  const extraBarCount = Math.ceil((barCount * wastagePercent) / 100);
  const totalBarCount = barCount + extraBarCount;
  const weightPerMeterKg = isPositiveFinite(input.weightPerMeterKg)
    ? input.weightPerMeterKg
    : (diameterMm * diameterMm) / 162;
  const requestedLengthMeters = barCount * barLengthMeters;
  const wastageLengthMeters = extraBarCount * barLengthMeters;
  const totalLengthMeters = totalBarCount * barLengthMeters;
  const requestedWeightKg = requestedLengthMeters * weightPerMeterKg;
  const wastageWeightKg = wastageLengthMeters * weightPerMeterKg;
  const totalWeightKg = totalLengthMeters * weightPerMeterKg;

  return {
    diameterMm,
    requestedBarCount: barCount,
    extraBarCount,
    totalBarCount,
    barLengthMeters,
    requestedLengthMeters,
    wastageLengthMeters,
    totalLengthMeters,
    weightPerMeterKg,
    requestedWeightKg,
    wastageWeightKg,
    totalWeightKg,
    totalWeightTons: totalWeightKg / 1000,
  };
}
