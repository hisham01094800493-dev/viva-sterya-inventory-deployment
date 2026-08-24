import { describe, expect, it } from "vitest";
import { resolveOfflineUser } from "../client/src/_core/hooks/offlineSession";

describe("offline auth session", () => {
  it("uses the cached user only while offline", () => {
    const cached = { id: 7, role: "admin" };
    expect(resolveOfflineUser(null, cached, true)).toEqual(cached);
    expect(resolveOfflineUser(null, cached, false)).toBeNull();
  });

  it("prefers the server-validated user when available", () => {
    const remote = { id: 3, role: "manager" };
    const cached = { id: 7, role: "admin" };
    expect(resolveOfflineUser(remote, cached, true)).toEqual(remote);
  });
});
