import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { listAuditLogs, listUsersForManagement, upsertSetting, createAuditLog } from "./db";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, listAuditLogs: vi.fn().mockResolvedValue([]), listUsersForManagement: vi.fn().mockResolvedValue([]), upsertSetting: vi.fn().mockResolvedValue({}), createAuditLog: vi.fn().mockResolvedValue({}) };
});

type Role = "user" | "admin" | "manager" | "operator" | "reviewer" | "reports";
function context(role: Role): TrpcContext {
  const now = new Date();
  return {
    user: { id: 1, openId: `governance-${role}`, email: `${role}@example.com`, name: role, loginMethod: "test", role, createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("governance role procedures", () => {
  it.each(["user", "operator", "reviewer", "reports", "manager"] as Role[])("rejects %s from admin-only user management", async role => {
    const caller = appRouter.createCaller(context(role));
    await expect(caller.governance.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.updateUserRole({ id: 2, role: "operator" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupExport()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.resetOperationalData({ confirmation: "خطأ", backupConfirmed: true } as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupCreate()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupVerificationConfig()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupVerificationRuns()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupVerificationRunNow()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupVerificationRunIsolatedFull()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupCleanupExpired()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupEmailTest()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.governance.backupVerificationSetSchedule({ enabled: true, cronExpression: "0 0 2 * * 0" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows management roles to read audit logs but not manage users", async () => {
    const caller = appRouter.createCaller(context("manager"));
    await expect(caller.governance.audit()).resolves.toEqual([]);
    await expect(caller.governance.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects reset without the exact destructive confirmation", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.governance.resetOperationalData({ confirmation: "ابدأ", backupConfirmed: true } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid backup record ids before database access", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.governance.backupDownload({ id: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.governance.backupRestoreRecord({ id: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows an admin to clear the company logo and rejects regular users", async () => {
    const adminCaller = appRouter.createCaller(context("admin"));
    await expect(adminCaller.settings.clearCompanyLogo()).resolves.toEqual({ cleared: true });
    expect(upsertSetting).toHaveBeenCalledWith(expect.objectContaining({ key: "company_logo_url", value: "", allowEmpty: true }));
    expect(createAuditLog).toHaveBeenCalled();
    const userCaller = appRouter.createCaller(context("user"));
    await expect(userCaller.settings.clearCompanyLogo()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an admin to access user management", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.governance.users()).resolves.toEqual([]);
    expect(listUsersForManagement).toHaveBeenCalledOnce();
  });
});
