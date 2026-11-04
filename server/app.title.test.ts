import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const shellHtml = readFileSync(path.resolve(import.meta.dirname, "..", "client", "index.html"), "utf8");

describe("Smart Inventory application title", () => {
  it("declares the product name in the document title", () => {
    expect(shellHtml).toContain("<title>Smart Inventory");
  });

  it("keeps the Arabic product description in the document title", () => {
    expect(shellHtml).toContain("إدارة المخزون");
  });

  it("exposes the same name to installed mobile shells", () => {
    expect(shellHtml).toMatch(/<meta\s+name="apple-mobile-web-app-title"\s+content="Smart Inventory"/);
  });

  it("serves the application shell from a single html entry point", () => {
    expect(shellHtml).toContain('<div id="root">');
  });
});
