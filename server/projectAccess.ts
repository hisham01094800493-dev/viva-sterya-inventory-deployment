export type ProjectAccessProject = {
  id: number;
  name: string;
  code: string;
  status: "active" | "archived";
};

export function normalizeProjectCode(value: string) {
  return value.trim().replace(/\s+/g, "-").toUpperCase();
}

export function parseAllowedProjectIds(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => Number.isInteger(item) && item > 0)
      : [];
  } catch {
    return [];
  }
}

export function canAccessProject(input: {
  role: string;
  allowedProjectIds: number[];
  project: Pick<ProjectAccessProject, "id" | "status"> | null | undefined;
}) {
  if (!input.project || input.project.status !== "active") return false;
  if (input.role === "admin") return true;
  return input.allowedProjectIds.includes(input.project.id);
}

export function chooseFallbackProject<T extends ProjectAccessProject>(projects: T[], activeProjectId?: number | null) {
  const active = activeProjectId == null ? undefined : projects.find(project => project.id === activeProjectId);
  return active ?? (projects.length === 1 ? projects[0] : undefined);
}

export function assertProjectCode(value: string) {
  const code = normalizeProjectCode(value);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(code)) {
    throw new Error("كود المشروع يجب أن يحتوي على حرفين أو رقمين على الأقل، وبأحرف إنجليزية أو أرقام فقط");
  }
  return code;
}
