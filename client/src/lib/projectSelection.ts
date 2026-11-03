export type ProjectOption = {
  id: number;
  name: string;
  code: string;
  status: "active" | "archived";
};

export type ResolvedActiveProject = {
  /** المشروع النشط الفعلي، أو null إذا لم يكن هناك مشروع صالح. */
  project: ProjectOption | null;
  /** true عندما يملك المستخدم أكثر من مشروع ولم يختر أيًا منها بعد. */
  needsExplicitSelection: boolean;
  /** معرّف المشروع الذي يجب حفظه تلقائيًا (يُملأ فقط عندما يملك المستخدم مشروعًا واحدًا). */
  autoSelectId: number | null;
};

/** المسارات التشغيلية التي لا يجوز فتحها بدون مشروع نشط. */
export const OPERATIONAL_PATH_PREFIXES = [
  "/items",
  "/warehouses",
  "/additions",
  "/disbursements",
  "/transfers",
  "/building-costs",
  "/stock-adjustments",
  "/inventory-audit",
  "/suppliers",
  "/customers",
  "/alerts",
  "/reports",
] as const;

export function isSelectableProject(project: Pick<ProjectOption, "status">) {
  return project.status === "active";
}

export function selectableProjects<T extends Pick<ProjectOption, "status">>(projects: T[] | null | undefined): T[] {
  return (projects ?? []).filter(isSelectableProject);
}

/**
 * يحسم المشروع النشط انطلاقًا من قائمة المشاريع المسموح بها للمستخدم
 * والمعرّف المحفوظ في تفضيلاته. لا يعتمد على أي قيمة قادمة من الواجهة
 * دون التحقق من وجودها ضمن المشاريع المسموح بها.
 */
export function resolveActiveProject(
  projects: ProjectOption[] | null | undefined,
  activeProjectId?: number | null,
): ResolvedActiveProject {
  const available = selectableProjects(projects);
  if (available.length === 0) {
    return { project: null, needsExplicitSelection: false, autoSelectId: null };
  }
  const stored =
    activeProjectId == null ? undefined : available.find(project => project.id === activeProjectId);
  if (stored) {
    return { project: stored, needsExplicitSelection: false, autoSelectId: null };
  }
  if (available.length === 1) {
    return { project: available[0], needsExplicitSelection: false, autoSelectId: available[0].id };
  }
  return { project: null, needsExplicitSelection: true, autoSelectId: null };
}

export function projectLabel(project: Pick<ProjectOption, "name" | "code">) {
  const name = project.name?.trim();
  return name || project.code;
}

export function projectOptionLabel(project: Pick<ProjectOption, "name" | "code">) {
  const name = project.name?.trim() || project.code;
  return `${name} · ${project.code}`;
}

/** هل المسار الحالي شاشة تشغيلية تحتاج مشروعًا نشطًا؟ */
export function isOperationalPath(path: string | null | undefined) {
  if (!path) return false;
  const clean = path.split("?")[0].split("#")[0];
  if (clean === "/") return true;
  if (clean === "/overview") return true;
  return OPERATIONAL_PATH_PREFIXES.some(prefix => clean === prefix || clean.startsWith(`${prefix}/`));
}

/**
 * يحدد ما إذا كان يجب حجب الشاشة التشغيلية الحالية.
 * لا يُحجب شيء إذا لم يكن نظام المشاريع متاحًا أصلًا (قاعدة بيانات لم تُرحّل بعد)،
 * حتى لا يتعطل التشغيل الحالي.
 */
export function shouldBlockOperationalScreen(input: {
  path: string | null | undefined;
  projectsAvailable: boolean;
  resolved: ResolvedActiveProject;
}) {
  if (!input.projectsAvailable) return false;
  if (!isOperationalPath(input.path)) return false;
  return input.resolved.project === null;
}

/** وصف قصير لحالة المشروع يُستخدم في الشريط العلوي. */
export function projectStatusLabel(resolved: ResolvedActiveProject) {
  if (resolved.project) return projectLabel(resolved.project);
  if (resolved.needsExplicitSelection) return "اختر مشروعًا";
  return "لا يوجد مشروع مخصص";
}
