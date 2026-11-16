export type MovementDetailKind = "additions" | "disbursements" | "transfers";

export function resolveMovementDetail(
  kind: MovementDetailKind,
  row: Record<string, any>,
  supplierNames: ReadonlyMap<number, string> = new Map(),
  customerNames: ReadonlyMap<number, string> = new Map(),
) {
  if (kind === "additions") {
    if (row.intakeType === "used_asset") {
      const conditionLabels: Record<string, string> = { good: "جيدة وتعمل", needs_repair: "تحتاج صيانة", damaged: "تالفة / للفحص" };
      const condition = conditionLabels[String(row.itemCondition ?? "")] || row.itemCondition;
      return ["موجودات مستعملة", row.sourceLocation, condition].filter(Boolean).join(" · ") || "موجودات مستعملة";
    }
    return supplierNames.get(Number(row.supplierId)) || row.supplier || row.store || "—";
  }
  if (kind === "disbursements") return row.buildingName || row.building || customerNames.get(Number(row.customerId)) || row.destination || row.store || "—";
  return `${row.fromStore || "—"} ← ${row.toStore || "—"}`;
}
