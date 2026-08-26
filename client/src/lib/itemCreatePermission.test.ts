import { describe, expect, it } from "vitest";
import { canCreateInventoryItems, ITEM_CREATE_DISABLED_PERMISSION, ITEM_CREATE_PERMISSION } from "./itemCreatePermission";

describe("صلاحية إنشاء الأصناف", () => {
  const inventoryScreen = ["dashboard", "inventory"];

  it("allows an operational inventory user by default and when explicitly granted", () => {
    expect(canCreateInventoryItems({ allowedScreens: inventoryScreen, allowedReports: ["movement-reports"], readOnly: false })).toBe(true);
    expect(canCreateInventoryItems({ allowedScreens: inventoryScreen, allowedReports: [ITEM_CREATE_PERMISSION], readOnly: false })).toBe(true);
  });

  it("blocks read-only users, users without inventory access, and an explicit denial", () => {
    expect(canCreateInventoryItems({ allowedScreens: inventoryScreen, allowedReports: [ITEM_CREATE_PERMISSION], readOnly: true })).toBe(false);
    expect(canCreateInventoryItems({ allowedScreens: ["dashboard"], allowedReports: [ITEM_CREATE_PERMISSION], readOnly: false })).toBe(false);
    expect(canCreateInventoryItems({ allowedScreens: inventoryScreen, allowedReports: [ITEM_CREATE_DISABLED_PERMISSION], readOnly: false })).toBe(false);
  });
});
