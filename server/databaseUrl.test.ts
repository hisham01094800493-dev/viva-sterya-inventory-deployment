import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl, normalizeEnvironmentValue } from "./_core/env";

describe("normalizeDatabaseUrl", () => {
  it("keeps a standard MySQL URL unchanged", () => {
    expect(normalizeDatabaseUrl("mysql://user:secret@example.internal:3306/railway")).toBe("mysql://user:secret@example.internal:3306/railway");
  });

  it("removes an accidentally repeated DATABASE_URL assignment", () => {
    expect(normalizeDatabaseUrl("DATABASE_URL=mysql://user:secret@example.internal:3306/railway")).toBe("mysql://user:secret@example.internal:3306/railway");
  });

  it("removes an accidentally repeated Google client variable assignment", () => {
    expect(normalizeEnvironmentValue("GOOGLE_CLIENT_ID=example.apps.googleusercontent.com", "GOOGLE_CLIENT_ID")).toBe("example.apps.googleusercontent.com");
  });
});
