export function cairoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find(value => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatCairoDateLabel(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split("-").reverse().join("/") : "—";
}

export function parseProjectWorkCenterLocation(location: string) {
  const query = location.split("?")[1]?.split("#", 1)[0] ?? "";
  const params = new URLSearchParams(query);
  const date = params.get("date");
  const parsedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date
    ? date
    : null;
  const rawProjectId = Number(params.get("projectId"));
  const projectId = Number.isInteger(rawProjectId) && rawProjectId > 0 ? rawProjectId : null;
  return { date: parsedDate, projectId };
}
