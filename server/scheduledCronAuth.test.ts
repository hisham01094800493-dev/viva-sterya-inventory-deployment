import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  isReportHeartbeatTask: vi.fn(),
  runDailyExecutiveReportIfDue: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./reportScheduler", () => ({
  isReportHeartbeatTask: mocks.isReportHeartbeatTask,
  runDailyExecutiveReportIfDue: mocks.runDailyExecutiveReportIfDue,
  getReportSchedulerConfig: vi.fn(),
}));

import { createDailyReportHeartbeatHandler } from "./scheduled";

function makeResponse() {
  const state = { statusCode: 200, body: undefined as unknown };
  const api = {
    status: vi.fn((statusCode: number) => { state.statusCode = statusCode; return api; }),
    json: vi.fn((body: unknown) => { state.body = body; return api; }),
  };
  return { state, api };
}

function makeRequest(authorization?: string, extraHeaders: Record<string, string> = {}) {
  return { method: "POST", headers: { ...(authorization ? { authorization } : {}), ...extraHeaders }, originalUrl: "/api/scheduled/daily-report-heartbeat" } as never;
}

describe("daily report heartbeat authentication", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret-with-at-least-32-characters";
    mocks.authenticateRequest.mockResolvedValue({ isCron: false });
    mocks.isReportHeartbeatTask.mockResolvedValue(true);
    mocks.runDailyExecutiveReportIfDue.mockResolvedValue({ status: "success", reportDate: "2026-10-31", runId: 12 });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("runs with a valid external secret without Manus authentication", async () => {
    const { state, api } = makeResponse();
    await createDailyReportHeartbeatHandler()(makeRequest(`Bearer ${process.env.CRON_SECRET}`), api as never);
    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ ok: true, source: "external-cron", status: "success" });
    expect(mocks.authenticateRequest).not.toHaveBeenCalled();
    expect(mocks.runDailyExecutiveReportIfDue).toHaveBeenCalledWith();
  });

  it("rejects a wrong secret", async () => {
    const { state, api } = makeResponse();
    await createDailyReportHeartbeatHandler()(makeRequest("Bearer wrong-secret"), api as never);
    expect(state.statusCode).toBe(403);
    expect(state.body).toEqual({ error: "cron-only" });
    expect(mocks.runDailyExecutiveReportIfDue).not.toHaveBeenCalled();
  });

  it("rejects a missing authorization header", async () => {
    const { state, api } = makeResponse();
    await createDailyReportHeartbeatHandler()(makeRequest(), api as never);
    expect(state.statusCode).toBe(403);
    expect(state.body).toEqual({ error: "cron-only" });
  });

  it("rejects unauthenticated requests when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { state, api } = makeResponse();
    await createDailyReportHeartbeatHandler()(makeRequest("Bearer anything"), api as never);
    expect(state.statusCode).toBe(403);
    expect(state.body).toEqual({ error: "cron-only" });
  });

  it("does not accept the spoofable Vercel cron header by itself", async () => {
    const { state, api } = makeResponse();
    await createDailyReportHeartbeatHandler()(makeRequest(undefined, { "x-vercel-cron-schedule": "* * * * *" }), api as never);
    expect(state.statusCode).toBe(403);
    expect(state.body).toEqual({ error: "cron-only" });
  });
});
