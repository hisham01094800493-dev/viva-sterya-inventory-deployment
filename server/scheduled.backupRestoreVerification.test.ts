import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  isBackupVerificationScheduleTask: vi.fn(),
  createBackupRecord: vi.fn(),
  runIsolatedFullBackupRestore: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./db", () => ({ createBackupRecord: mocks.createBackupRecord, isBackupVerificationScheduleTask: mocks.isBackupVerificationScheduleTask, runIsolatedFullBackupRestore: mocks.runIsolatedFullBackupRestore }));

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
    expect(mocks.runIsolatedFullBackupRestore).not.toHaveBeenCalled();
  });

  it("runs the safe scheduled verification only for the configured task", async () => {
    mocks.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cron-backup-check" });
    mocks.isBackupVerificationScheduleTask.mockResolvedValue(true);
    mocks.createBackupRecord.mockResolvedValue({ record: { id: 90002 } });
    mocks.runIsolatedFullBackupRestore.mockResolvedValue({ runId: 7, status: "passed", backupRecordId: 90001 });
    const { state, api } = makeResponse();
    await createBackupRestoreVerificationHandler()({ originalUrl: "/api/scheduled/backup-restore-verification" } as never, api as never);
    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ ok: true, taskUid: "cron-backup-check", backupRecordId: 90002, runId: 7, status: "passed" });
    expect(mocks.createBackupRecord).toHaveBeenCalledWith({ backupType: "scheduled" });
    expect(mocks.runIsolatedFullBackupRestore).toHaveBeenCalledWith();
  });
});
