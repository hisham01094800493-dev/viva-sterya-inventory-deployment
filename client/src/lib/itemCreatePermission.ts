export const ITEM_CREATE_PERMISSION = "item-create";
export const ITEM_CREATE_DISABLED_PERMISSION = "item-create-disabled";

type ItemCreationPermissions = { allowedScreens: string[]; allowedReports: string[]; readOnly: boolean } | undefined | null;

export function canCreateInventoryItems(permissions: ItemCreationPermissions) {
  if (!permissions || permissions.readOnly || !permissions.allowedScreens.includes("inventory")) return false;
  return permissions.allowedReports.includes(ITEM_CREATE_PERMISSION) || !permissions.allowedReports.includes(ITEM_CREATE_DISABLED_PERMISSION);
}
