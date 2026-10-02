import { InventoryError } from "./errors";

/** Store all inventory decimal values as scaled integers during calculations. */
export function toScaled(value: string | number | null | undefined): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    throw new InventoryError("BAD_REQUEST", "قيمة كمية غير صالحة");
  }
  return Math.round((numeric + Number.EPSILON) * 1000);
}

export function fromScaled(value: number): string {
  return (value / 1000).toFixed(3);
}

export function toMoneyScaled(
  value: string | number | null | undefined
): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric))
    throw new InventoryError("BAD_REQUEST", "قيمة سعر غير صالحة");
  return Math.round((numeric + Number.EPSILON) * 100);
}

export function fromMoneyScaled(value: number): string {
  return (value / 100).toFixed(2);
}

export function calculateTotalValue(
  unitPriceScaled: number,
  quantityScaled: number
): number {
  return Math.round((unitPriceScaled * quantityScaled) / 1000);
}

export function calculateStockDelta(
  item: {
    code: string;
    incomingStock: string | number;
    outgoingStock: string | number;
    currentStock: string | number;
  },
  deltas: { incoming: number; outgoing: number; current: number }
) {
  const nextIncoming = toScaled(item.incomingStock) + deltas.incoming;
  const nextOutgoing = toScaled(item.outgoingStock) + deltas.outgoing;
  const nextCurrent = toScaled(item.currentStock) + deltas.current;

  if (nextIncoming < 0 || nextOutgoing < 0) {
    throw new InventoryError("CONFLICT", "لا يمكن أن تصبح حركة المخزون سالبة");
  }
  if (nextCurrent < 0) {
    throw new InventoryError(
      "CONFLICT",
      `الرصيد الحالي للصنف ${item.code} لا يكفي لتنفيذ عملية الصرف`
    );
  }
  return {
    incomingStock: fromScaled(nextIncoming),
    outgoingStock: fromScaled(nextOutgoing),
    currentStock: fromScaled(nextCurrent),
  };
}
