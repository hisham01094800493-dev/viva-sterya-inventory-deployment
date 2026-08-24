import { describe, expect, it } from "vitest";
import { activityCleanupEntityLabel, buildActivityCleanupAuditDetails } from "./activityCleanup";

describe("تنظيف سجلات النشاط", () => {
  it("يطبع عددًا صحيحًا غير سالب في سجل التدقيق", () => {
    expect(buildActivityCleanupAuditDetails(12.8)).toEqual({ deleted: 12 });
    expect(buildActivityCleanupAuditDetails(-4)).toEqual({ deleted: 0 });
  });

  it("يميز بين سجل المشاركات وسجل الدخول", () => {
    expect(activityCleanupEntityLabel("share_activity")).toBe("سجل المشاركات");
    expect(activityCleanupEntityLabel("login_activity")).toBe("سجل الدخول");
  });
});
