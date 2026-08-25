export const DEFAULT_COMPANY_LOGO_URL = "/icons/smart-inventory-app-512.png";

export const RAILWAY_APP_ICON_OPTIONS = [
  { id: "teal", label: "Teal الأساسي", url: "/icons/smart-inventory-app-512.png" },
  { id: "navy", label: "كحلي هادئ", url: "/icons/smart-inventory-512.png" },
  { id: "gold", label: "ذهبي واضح", url: "/icons/smart-inventory-gold-512.png" },
] as const;

export function resolveCompanyLogoUrl(value: string | null | undefined) {
  const url = value?.trim();
  return !url || url.startsWith("/manus-storage/") ? DEFAULT_COMPANY_LOGO_URL : url;
}
