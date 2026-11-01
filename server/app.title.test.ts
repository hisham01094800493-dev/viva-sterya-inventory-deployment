import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Smart Inventory application title", () => {
  it("exposes the configured title and application shell metadata", async () => {
    const html = await readFile(new URL("../client/index.html", import.meta.url), "utf8");

    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toMatch(/<title>Smart Inventory \| إدارة المخزون<\/title>/);
    expect(html).toMatch(/<meta name="description" content="منصة Smart Inventory الاحترافية لإدارة المخزون"\s*\/>/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="Smart Inventory"\s*\/>/);
  });
});
