export const movementTableZoomLimits = { min: 0.5, max: 1.6, step: 0.1 } as const;

export function clampMovementTableZoom(value: number) {
  return Math.min(movementTableZoomLimits.max, Math.max(movementTableZoomLimits.min, Number(value.toFixed(2))));
}

export function getMovementTablePinchZoom(startZoom: number, startDistance: number, nextDistance: number) {
  return startDistance > 0 && nextDistance > 0
    ? clampMovementTableZoom(startZoom * (nextDistance / startDistance))
    : clampMovementTableZoom(startZoom);
}

export function shouldShowMovementPageSkeleton(isFetching: boolean) {
  return isFetching;
}

export type MovementTotalsFilters = {
  supplier: string;
  customer: string;
  item: string;
  permit: string;
  purpose: string;
  from: string;
  to: string;
};

export function getMovementTotalsScopeLabel(filters: MovementTotalsFilters) {
  return filters.supplier !== "all" || filters.customer !== "all" || Boolean(
    filters.item.trim() ||
    filters.permit.trim() ||
    filters.purpose.trim() ||
    filters.from.trim() ||
    filters.to.trim(),
  )
    ? "نتائج البحث"
    : "كل الحركات";
}

export function getNextPinnedMovementColumn(currentColumn: number | null, selectedColumn: number) {
  return currentColumn === selectedColumn ? null : selectedColumn;
}

export function getNextPinnedMovementColumns(currentColumns: number[], selectedColumn: number) {
  return currentColumns.includes(selectedColumn)
    ? currentColumns.filter(column => column !== selectedColumn)
    : [...currentColumns, selectedColumn].slice(-2);
}

export function getPinnedMovementColumnOffsets(columns: number[], widths: Map<number, number>) {
  const offsets = new Map<number, number>();
  let nextOffset = 0;
  [...columns]
    .sort((left, right) => left - right)
    .forEach(column => {
      offsets.set(column, nextOffset);
      nextOffset += Math.max(0, widths.get(column) ?? 0);
    });
  return offsets;
}
