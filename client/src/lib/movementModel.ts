import type { LucideIcon } from "lucide-react";

export type MovementKind = "additions" | "disbursements" | "transfers";
export type MovementRow = { id: number; date: string; eznNum: string; itemCode: string; itemName: string; quantity: string; [key: string]: any };
export type MovementForm = { date: string; eznNum: string; itemCode: string; quantity: string; unitPrice: string; store: string; warehouseId: string; purpose: string; supplier: string; supplierId: string; category: string; destination: string; customerId: string; buildingId: string; fromCustomerId: string; toCustomerId: string; notes: string; disburseType: string; fromStore: string; toStore: string; transferType: string };
export type MovementLine = { id: number; itemCode: string; quantity: string; unitPrice: string; itemName?: string; buildingId?: string; purpose?: string; balance?: number; loading?: boolean };

export const blankMovement = (date = new Date().toISOString().slice(0, 10)): MovementForm => ({ date, eznNum: "", itemCode: "", quantity: "", unitPrice: "", store: "", warehouseId: "", purpose: "", supplier: "", supplierId: "", category: "", destination: "", customerId: "", buildingId: "", fromCustomerId: "", toCustomerId: "", notes: "", disburseType: "", fromStore: "", toStore: "", transferType: "transfer" });

export function isMovementCancellationReversal(row: Pick<MovementRow, "eznNum"> & { disburseType?: unknown; notes?: unknown; purpose?: unknown }) {
  return String(row.eznNum ?? "").includes("-REV-") || String(row.disburseType ?? "") === "إلغاء موثق" || String(row.notes ?? row.purpose ?? "").startsWith("إلغاء موثق للحركة ");
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function isNetworkFailure(error: unknown, online = typeof navigator === "undefined" ? true : navigator.onLine) {
  if (!online) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("network") || message.includes("fetch") || message.includes("failed to load") || message.includes("timeout");
}

export type MovementMeta = { eyebrow: string; title: string; description: string; button: string; icon: LucideIcon; accent: string };
