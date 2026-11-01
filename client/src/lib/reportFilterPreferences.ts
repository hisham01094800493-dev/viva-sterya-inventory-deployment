export type ReportFilterSnapshot = {
  reportType: string;
  from: string;
  to: string;
  movement: string;
  variance: string;
  unlinked: string;
  permit: string;
  itemCode: string;
  itemName: string;
  warehouse: string;
  incomingFrom: string;
  outgoingTo: string;
  additionPurpose: string;
  disbursementPurpose: string;
  returnPurpose: string;
  savedAt: string;
};

const STORAGE_PREFIX = "smart-inventory-report-filters-v1";

function keyForUser(userId?: number | null) {
  return `${STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

export function readReportFilterSnapshot(storage: Pick<Storage, "getItem">, userId?: number | null): ReportFilterSnapshot | null {
  try {
    const raw = storage.getItem(keyForUser(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ReportFilterSnapshot>;
    if (!value || typeof value !== "object" || typeof value.savedAt !== "string") return null;
    const textFields = ["reportType", "from", "to", "movement", "variance", "unlinked", "permit", "itemCode", "itemName", "warehouse", "incomingFrom", "outgoingTo", "additionPurpose", "disbursementPurpose", "returnPurpose"] as const;
    if (textFields.some(field => typeof value[field] !== "string")) return null;
    return value as ReportFilterSnapshot;
  } catch {
    return null;
  }
}

export function writeReportFilterSnapshot(storage: Pick<Storage, "setItem">, userId: number | null | undefined, snapshot: Omit<ReportFilterSnapshot, "savedAt">) {
  try {
    storage.setItem(keyForUser(userId), JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }));
  } catch {
    // Private browsing or a full storage quota should not block report filtering.
  }
}

export function clearReportFilterSnapshot(storage: Pick<Storage, "removeItem">, userId?: number | null) {
  try {
    storage.removeItem(keyForUser(userId));
  } catch {
    // Ignore unavailable local storage.
  }
}

export function formatReportFilterSavedAt(savedAt: string, locale = "ar-EG") {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}
