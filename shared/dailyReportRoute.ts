type DailyReportProject = { id: number; name?: string | null };

type DailyReportNotification = {
  notificationType?: string | null;
  title?: string | null;
  message?: string | null;
  link?: string | null;
  createdAt?: Date | string | null;
};

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function cairoDate(value?: Date | string | null) {
  const parsed = value instanceof Date ? value : new Date(value ?? Date.now());
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find(entry => entry.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function buildDailyReportNotificationLink(reportDate: string, projectId?: number | null) {
  const date = isIsoDate(reportDate) ? reportDate : cairoDate();
  const params = new URLSearchParams({ date });
  if (projectId != null && Number.isInteger(projectId) && projectId > 0) params.set("projectId", String(projectId));
  return `/project-work-center?${params.toString()}`;
}

function projectIdFromLegacyNotification(row: DailyReportNotification, projects: DailyReportProject[]) {
  const title = row.title?.trim() ?? "";
  const message = row.message?.trim() ?? "";
  const namedProject = projects.find(project => {
    const name = project.name?.trim();
    return Boolean(name && (title.endsWith(`— ${name}`) || message.startsWith(`[${name}]`)));
  });
  return namedProject?.id ?? null;
}

function savedDailyReportParams(link?: string | null) {
  if (!link) return null;
  const [path, query = ""] = link.split("?", 2);
  if (path !== "/reports" && path !== "/project-work-center") return null;
  return new URLSearchParams(query.split("#", 1)[0]);
}

export function resolveNotificationLink(row: DailyReportNotification, projects: DailyReportProject[] = []) {
  if (row.notificationType !== "daily_report") return row.link || "/alerts";

  const savedParams = savedDailyReportParams(row.link);
  const savedReportDate = savedParams?.get("date") || savedParams?.get("from") || cairoDate(row.createdAt);
  const parsedProjectId = Number(savedParams?.get("projectId"));
  const projectId = Number.isInteger(parsedProjectId) && parsedProjectId > 0
    ? parsedProjectId
    : projectIdFromLegacyNotification(row, projects);
  return buildDailyReportNotificationLink(savedReportDate, projectId);
}
