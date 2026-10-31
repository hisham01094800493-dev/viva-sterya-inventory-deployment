import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  isReportHeartbeatTask: vi.fn(),
  runDailyExecutiveReportIfDue: vi.fn(),
  getReportSchedulerConfig: vi.fn(),
  getSettingValue: vi.fn(),
  isBackupVerificationScheduleTask: vi.fn(),
  runScheduledBackupVerification: vi.fn(),
  runInventoryReport: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./reportScheduler", () => ({
  isReportHeartbeatTask: mocks.isReportHeartbeatTask,
  runDailyExecutiveReportIfDue: mocks.runDailyExecutiveReportIfDue,
  getReportSchedulerConfig: mocks.getReportSchedulerConfig,
}));
vi.mock("./db", () => ({
  getSettingValue: mocks.getSettingValue,
  isBackupVerificationScheduleTask: mocks.isBackupVerificationScheduleTask,
  runScheduledBackupVerification: mocks.runScheduledBackupVerification,
}));
vi.mock("./inventoryReports", () => ({ runInventoryReport: mocks.runInventoryReport }));

import { createCronJobDailyReportHandler, createDailyReportHeartbeatHandler, createDailyReportStatusHandler } from "./scheduled";

function makeResponse() {
  const state = { statusCode: 200, body: undefined as any };
  const api = {
    status: vi.fn((statusCode: number) => { state.statusCode = statusCode; return api; }),
    json: vi.fn((body: unknown) => { state.body = body; return api; }),
  };
  return { state, api };
}

function makeRequest(method: string, authorization?: string) {
  return { method, headers: authorization ? { authorization } : {}, originalUrl: "/api/scheduled/daily-report-heartbeat" } as never;
}

describe("daily report cron endpoints", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret-with-at-least-32-characters";
    mocks.runDailyExecutiveReportIfDue.mockResolvedValue({ status: "success", reportDate: "2026-10-31", runId: 7 });
    mocks.getReportSchedulerConfig.mockResolvedValue({
      enabled: true,
      time: "17:00",
      lastRun: null,
      lastSuccessfulDate: null,
      nextRunAt: "2026-10-31T15:00:00.000Z",
      timeZone: "Africa/Cairo",
    });
    mocks.getSettingValue.mockResolvedValue("manager@example.com");
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("accepts GET requests from cron-job.org for the heartbeat", async () => {
    mocks.authenticateRequest.mockResolvedValue(null);
    const { state, api } = makeResponse();
    await createDailyReportHeartbeatHandler()(makeRequest("GET", `Bearer ${process.env.CRON_SECRET}`), api as never);
    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ ok: true, source: "external-cron", status: "success" });
    expect(mocks.runDailyExecutiveReportIfDue).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported methods on the heartbeat", async () => {
    const { state, api } = makeResponse();
    await createDailyReportHeartbeatHandler()(makeRequest("DELETE", `Bearer ${process.env.CRON_SECRET}`), api as never);
    expect(state.statusCode).toBe(405);
    expect(mocks.runDailyExecutiveReportIfDue).not.toHaveBeenCalled();
  });

  it("runs the Vercel cron only when the report is due", async () => {
    mocks.runDailyExecutiveReportIfDue.mockResolvedValue({ status: "skipped", reason: "not-due", reportDate: "2026-10-31" });
    const { state, api } = makeResponse();
    await createCronJobDailyReportHandler()(makeRequest("GET", `Bearer ${process.env.CRON_SECRET}`), api as never);
    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ ok: true, source: "vercel-cron", status: "skipped" });
  });

  it("exposes schedule diagnostics for a valid secret", async () => {
    const { state, api } = makeResponse();
    await createDailyReportStatusHandler()(makeRequest("GET", `Bearer ${process.env.CRON_SECRET}`), api as never);
    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({
      ok: true,
      enabled: true,
      time: "17:00",
      timeZone: "Africa/Cairo",
      nextRunAt: "2026-10-31T15:00:00.000Z",
      cronSecretConfigured: true,
      channels: { inApp: true, recipients: 1 },
    });
  });

  it("protects the diagnostics endpoint with the cron secret", async () => {
    const { state, api } = makeResponse();
    await createDailyReportStatusHandler()(makeRequest("GET", "Bearer wrong"), api as never);
    expect(state.statusCode).toBe(401);
  });
});
