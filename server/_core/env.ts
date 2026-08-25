export function normalizeEnvironmentValue(value: string | undefined, variableName: string) {
  const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (value ?? "").trim().replace(new RegExp(`^${escapedName}\\s*=\\s*`, "i"), "");
}

export function normalizeDatabaseUrl(value: string | undefined) {
  return normalizeEnvironmentValue(value, "DATABASE_URL");
}

export const ENV = {
  appId: process.env.APP_ID ?? "smart-inventory-railway",
  cookieSecret: process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? "",
  databaseUrl: normalizeDatabaseUrl(process.env.DATABASE_URL),
  appUrl: normalizeEnvironmentValue(process.env.APP_URL, "APP_URL"),
  googleClientId: normalizeEnvironmentValue(process.env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
  googleClientSecret: normalizeEnvironmentValue(process.env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
  ownerEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
