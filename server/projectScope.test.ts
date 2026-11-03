import { beforeEach, describe, expect, it, vi } from "vitest";

const getActiveProjectForUser = vi.fn();

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getActiveProjectForUser };
});

const { resolveProjectScope, projectScopeFor } = await import("./projectScope");

describe("project scope resolution", () => {
  beforeEach(() => {
    getActiveProjectForUser.mockReset();
  });

  it("returns the active project id, code and name", async () => {
    getActiveProjectForUser.mockResolvedValue({
      id: 7,
      code: "PROJECT-2",
      name: "المشروع الثاني",
      status: "active",
    });

    await expect(resolveProjectScope(1, "user")).resolves.toEqual({
      projectId: 7,
      projectCode: "PROJECT-2",
      projectName: "المشروع الثاني",
    });
  });

  it("degrades to an unscoped request when the user has no project", async () => {
    getActiveProjectForUser.mockResolvedValue(null);

    await expect(resolveProjectScope(1, "user")).resolves.toEqual({
      projectId: null,
      projectCode: null,
      projectName: null,
    });
  });

  it("degrades to an unscoped request when the projects layer is unavailable", async () => {
    getActiveProjectForUser.mockRejectedValue(new Error("Table 'projects' doesn't exist"));

    await expect(resolveProjectScope(1, "user")).resolves.toEqual({
      projectId: null,
      projectCode: null,
      projectName: null,
    });
  });

  it("reuses a scope already attached to the context instead of re-querying", async () => {
    const scope = { projectId: 3, projectCode: "MAIN", projectName: "مشروع جديد" };

    await expect(
      projectScopeFor({ user: { id: 1, role: "user" }, projectScope: scope })
    ).resolves.toBe(scope);
    expect(getActiveProjectForUser).not.toHaveBeenCalled();
  });

  it("resolves the scope on demand when the context has none", async () => {
    getActiveProjectForUser.mockResolvedValue({
      id: 1,
      code: "MAIN",
      name: "مشروع جديد",
      status: "active",
    });

    await expect(
      projectScopeFor({ user: { id: 5, role: "admin" } })
    ).resolves.toMatchObject({ projectId: 1, projectCode: "MAIN" });
    expect(getActiveProjectForUser).toHaveBeenCalledWith(5, "admin");
  });
});
