export const permissionTemplates = {
  accountant: {
    label: "محاسب",
    readOnly: true,
    screens: ["dashboard", "inventory", "reports", "suppliers", "customers", "alerts"],
    reports: ["inventory-summary", "movement-reports", "item-card", "supplier-account", "customer-account", "adjustments"],
  },
  cashier: {
    label: "كاشير",
    readOnly: false,
    screens: ["dashboard", "inventory", "additions", "disbursements", "customers", "alerts"],
    reports: ["inventory-summary", "movement-reports", "item-card"],
  },
  viewer: {
    label: "مشاهد",
    readOnly: true,
    screens: ["dashboard", "inventory", "reports", "alerts"],
    reports: ["inventory-summary", "movement-reports", "item-card"],
  },
  siteEngineer: {
    label: "مهندس موقع",
    readOnly: true,
    screens: ["inventory", "additions", "suppliers", "reports"],
    reports: ["inventory-summary", "movement-reports", "item-card", "supplier-account"],
  },
} as const;

export type PermissionTemplateKey = keyof typeof permissionTemplates;

export function getPermissionTemplate(key: PermissionTemplateKey) {
  return permissionTemplates[key];
}
