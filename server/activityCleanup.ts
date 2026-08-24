export type ActivityCleanupEntity = "share_activity" | "login_activity";

export function buildActivityCleanupAuditDetails(deleted: number) {
  return { deleted: Math.max(0, Math.trunc(deleted)) };
}

export function activityCleanupEntityLabel(entity: ActivityCleanupEntity) {
  return entity === "share_activity" ? "سجل المشاركات" : "سجل الدخول";
}
