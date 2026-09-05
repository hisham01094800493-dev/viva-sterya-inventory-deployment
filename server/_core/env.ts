function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

export function normalizeEnvironmentValue(value: string | undefined, variableName: string) {
  const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return clean(value).replace(new RegExp(`^${escapedName}\\s*=\\s*`, "i"), "");
}

export function normalizeDatabaseUrl(value: string | undefined) {
  return normalizeEnvironmentValue(value, "DATABASE_URL");
}

export function buildDatabaseUrlFromEnv() {
  const host = clean(process.env.DB_HOST);
  const user = clean(process.env.DB_USER);
  const password = process.env.DB_PASSWORD ?? "";
  const name = clean(process.env.DB_NAME);
  const port = clean(process.env.DB_PORT) || "3306";
  if (!host || !user || !name) return "";
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(name)}`;
}

export function getDatabaseUrl() {
  // Prefer explicit DB_* variables in hosted environments. This prevents a
  // stale DATABASE_URL (for example one still pointing at the old database)
  // from overriding the deployment's current host, database, and TLS setup.
  return buildDatabaseUrlFromEnv() || normalizeDatabaseUrl(process.env.DATABASE_URL);
}

export function getDatabaseSsl() {
  const ca = clean(process.env.DB_SSL_CA || process.env.MYSQL_SSL_CA);
  if (ca) return { ca, rejectUnauthorized: true };
  if (clean(process.env.DB_SSL).toLowerCase() === "false") return undefined;
  return { rejectUnauthorized: true };
}

export const ENV = {
  appId: process.env.APP_ID ?? "smart-inventory",
  cookieSecret: process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? "",
  databaseUrl: getDatabaseUrl(),
  databaseSsl: getDatabaseSsl(),
  appUrl: normalizeEnvironmentValue(process.env.APP_URL, "APP_URL"),
  googleClientId: normalizeEnvironmentValue(process.env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
  googleClientSecret: normalizeEnvironmentValue(process.env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
  ownerEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
