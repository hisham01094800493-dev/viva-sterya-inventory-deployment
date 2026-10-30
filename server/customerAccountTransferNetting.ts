export type CustomerAccountTotal = {
  name: string;
  movements: number;
  quantity: number;
  value: number;
  negativeReturnQuantity: number;
  negativeReturnValue: number;
  negativeReturnMovements: number;
  returns: number;
  returnMovements: number;
};

export type CustomerTransferTotal = {
  partyId: number | null;
  quantity: unknown;
  value: unknown;
};

function numericMagnitude(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.abs(number) : 0;
}

function roundTo(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

/**
 * Convert transfer quantities into per-party balance adjustments for the
 * account-analysis report. Transfers reduce the source and increase the
 * destination; they are not new disbursement movements or returns.
 */
export function applyCustomerAccountTransferNetting(
  rows: CustomerAccountTotal[],
  outgoing: CustomerTransferTotal[],
  incoming: CustomerTransferTotal[],
  customerNames: Map<number, string>,
) {
  const totals = new Map(rows.map(row => [row.name, { ...row }]));

  const apply = (transfers: CustomerTransferTotal[], direction: -1 | 1) => {
    for (const transfer of transfers) {
      if (transfer.partyId == null) continue;
      const name = customerNames.get(transfer.partyId) ?? "—";
      const row = totals.get(name) ?? {
        name,
        movements: 0,
        quantity: 0,
        value: 0,
        negativeReturnQuantity: 0,
        negativeReturnValue: 0,
        negativeReturnMovements: 0,
        returns: 0,
        returnMovements: 0,
      };
      row.quantity = roundTo(row.quantity + direction * numericMagnitude(transfer.quantity), 3);
      row.value = roundTo(row.value + direction * numericMagnitude(transfer.value), 2);
      totals.set(name, row);
    }
  };

  apply(outgoing, -1);
  apply(incoming, 1);

  return Array.from(totals.values()).sort((left, right) => right.value - left.value);
}
