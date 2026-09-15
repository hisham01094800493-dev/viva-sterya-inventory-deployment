import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  isBackupVerificationScheduleTask: vi.fn(),
  runScheduledBackupVerification: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./db", () => ({ isBackupVerificationScheduleTask: mocks.isBackupVerificationScheduleTask, runScheduledBackupVerification: mocks.runScheduledBackupVerification }));

import { createBackupRestoreVerificationHandler } from "./scheduled";

function makeResponse() {
  const state = { statusCode: 200, body: undefined as unknown };
  const api = { status: vi.fn((statusCode: number) => { state.statusCode = statusCode; return api; }), json: vi.fn((body: unknown) => { state.body = body; return api; }) };
  return { state, api };
}

describe("scheduled backup restore verification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a request that is not a Heartbeat cron", async () => {
    mocks.authenticateRequest.mockResolvedValue({ isCron: false });
    const { state, api } = makeResponse();
    await createBackupRestoreVerificationHandler()({ originalUrl: "/api/scheduled/backup-restore-verification" } as never, api as never);
    expect(state.statusCode).toBe(403);
    expect(state.body).toEqual({ error: "cron-only" });
  });

  it("skips a disabled or unknown cron without attempting restore work", async () => {
    mocks.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cron-disabled" });
    mocks.isBackupVerificationScheduleTask.mockResolvedValue(false);
    const { state, api } = makeResponse();
    await createBackupRestoreVerificationHandler()({ originalUrl: "/api/scheduled/backup-restore-verification" } as never, api as never);
    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ ok: true, skipped: "orphan_or_disabled" });
    expect(mocks.runScheduledBackupVerification).not.toHaveBeenCalled();
  });

  it("runs the safe scheduled verification only for the configured task", async () => {
    mocks.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cron-backup-check" });
    mocks.isBackupVerificationScheduleTask.mockResolvedValue(true);
    mocks.runScheduledBackupVerification.mockResolvedValue({ runId: 7, status: "passed", backupRecordId: 90002 });
    const { state, api } = makeResponse();
    await createBackupRestoreVerificationHandler()({ originalUrl: "/api/scheduled/backup-restore-verification" } as never, api as never);
    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ ok: true, taskUid: "cron-backup-check", runId: 7, status: "passed", backupRecordId: 90002 });
    expect(mocks.runScheduledBackupVerification).toHaveBeenCalledWith();
  });

  it("does not expose internal restore errors in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mocks.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cron-backup-check" });
    mocks.isBackupVerificationScheduleTask.mockResolvedValue(true);
    mocks.runScheduledBackupVerification.mockRejectedValue(new Error("DATABASE_PASSWORD leaked"));
    const { state, api } = makeResponse();
    await createBackupRestoreVerificationHandler()({ originalUrl: "/api/scheduled/backup-restore-verification" } as never, api as never);
    process.env.NODE_ENV = previousNodeEnv;
    expect(state.statusCode).toBe(500);
    expect(state.body).toMatchObject({ error: "تعذر تنفيذ اختبار النسخ والاستعادة" });
    expect(JSON.stringify(state.body)).not.toContain("DATABASE_PASSWORD leaked");
  });
});
