import { describe, expect, it } from "vitest";

describe("Smart Inventory application title", () => {
  it("exposes the configured title and serves the application shell", async () => {
    expect(process.env.VITE_APP_TITLE).toBe("Smart Inventory");

    const response = await fetch("http://127.0.0.1:3000/");
    expect(response.ok).toBe(true);
    const html = await response.text();
    expect(html).toContain("Smart Inventory");
  });
});
