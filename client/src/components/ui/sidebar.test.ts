import { describe, expect, it } from "vitest";
import { getSidebarInnerClassName } from "./sidebar";

describe("getSidebarInnerClassName", () => {
  it("applies a custom sidebar surface to the visible inner layer", () => {
    const className = getSidebarInnerClassName("smart-sidebar-surface border-l");
    expect(className).toContain("bg-sidebar");
    expect(className).toContain("smart-sidebar-surface");
    expect(className).toContain("border-l");
  });
});
