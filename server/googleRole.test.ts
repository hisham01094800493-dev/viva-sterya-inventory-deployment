import { describe, expect, it } from "vitest";
import { resolveGoogleUserRole } from "./db";

describe("resolveGoogleUserRole", () => {
  it("promotes a previously created Google user when their email matches ADMIN_EMAIL", () => {
    expect(resolveGoogleUserRole("admin@example.com", "user", "admin@example.com")).toBe("admin");
  });

  it("keeps the existing role when the Google email does not match ADMIN_EMAIL", () => {
    expect(resolveGoogleUserRole("member@example.com", "user", "admin@example.com")).toBe("user");
  });
});
