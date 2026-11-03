import { describe, expect, it } from "vitest";
import { assertProjectCode, canAccessProject, chooseFallbackProject, normalizeProjectCode, parseAllowedProjectIds } from "./projectAccess";

describe("project access", () => {
  it("normalizes project codes consistently", () => {
    expect(normalizeProjectCode("  main project  ")).toBe("MAIN-PROJECT");
    expect(assertProjectCode("main")).toBe("MAIN");
  });

  it("rejects invalid project codes", () => {
    expect(() => assertProjectCode("مخزن" )).toThrow();
    expect(() => assertProjectCode("A")).toThrow();
  });

  it("parses only positive integer project ids", () => {
    expect(parseAllowedProjectIds('[1, "2", 0, -4, 3.5, 7]')).toEqual([1, 7]);
    expect(parseAllowedProjectIds("broken")).toEqual([]);
  });

  it("allows admins to access active projects only", () => {
    expect(canAccessProject({ role: "admin", allowedProjectIds: [], project: { id: 9, status: "active" } })).toBe(true);
    expect(canAccessProject({ role: "admin", allowedProjectIds: [], project: { id: 9, status: "archived" } })).toBe(false);
  });

  it("keeps regular users inside their assigned projects", () => {
    expect(canAccessProject({ role: "user", allowedProjectIds: [2], project: { id: 2, status: "active" } })).toBe(true);
    expect(canAccessProject({ role: "user", allowedProjectIds: [2], project: { id: 3, status: "active" } })).toBe(false);
  });

  it("uses the saved project or the only available project as fallback", () => {
    const projects = [{ id: 1, name: "Main", code: "MAIN", status: "active" as const }];
    expect(chooseFallbackProject(projects, null)?.id).toBe(1);
    expect(chooseFallbackProject(projects, 1)?.code).toBe("MAIN");
    expect(chooseFallbackProject([], null)).toBeUndefined();
  });
});
