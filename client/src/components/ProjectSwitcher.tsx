import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Boxes, Check, ChevronDown, Factory, Layers3, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  projectLabel,
  projectOptionLabel,
  projectVisual,
  resolveActiveProject,
  selectableProjects,
  type ProjectOption,
  type ResolvedActiveProject,
} from "@/lib/projectSelection";

export function ProjectVisualIcon({ project, size = "h-3.5 w-3.5" }: { project: ProjectOption; size?: string }) {
  const visual = projectVisual(project);
  const Icon = visual.icon === "main" ? Boxes : visual.icon === "building" ? Building2 : visual.icon === "factory" ? Factory : Layers3;
  const tone = visual.tone === "teal" ? "bg-[#d9f3ef] text-[#0d7180] dark:bg-[#235157] dark:text-[#bff1eb]" : visual.tone === "blue" ? "bg-[#e1efff] text-[#2866a8] dark:bg-[#203b50] dark:text-[#bfe5ff]" : visual.tone === "orange" ? "bg-[#fff0d2] text-[#a96821] dark:bg-[#453722] dark:text-[#ffe2a3]" : "bg-[#eee5ff] text-[#7050a8] dark:bg-[#352d4c] dark:text-[#e0d4ff]";
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-lg p-1 ${tone}`}><Icon className={size} /></span>;
}

export type ActiveProjectState = {
  /** هل نظام المشاريع متاح على الخادم؟ (يكون false إذا لم تُرحّل قاعدة البيانات بعد) */
  projectsAvailable: boolean;
  isLoading: boolean;
  projects: ProjectOption[];
  resolved: ResolvedActiveProject;
};

/**
 * يقرأ المشاريع المسموح بها للمستخدم والمشروع النشط من الخادم.
 * عند تعذّر الوصول (قاعدة بيانات لم تُرحّل بعد) يعيد حالة "غير متاح"
 * بدلًا من تعطيل الواجهة، حتى لا يتأثر التشغيل الحالي.
 */
export function useActiveProjectState(): ActiveProjectState {
  const listQuery = trpc.projects.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const activeQuery = trpc.projects.active.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const projects = useMemo(
    () => selectableProjects((listQuery.data ?? []) as ProjectOption[]),
    [listQuery.data],
  );

  const activeId = (activeQuery.data as ProjectOption | null | undefined)?.id ?? null;
  const resolved = useMemo(() => resolveActiveProject(projects, activeId), [projects, activeId]);

  return {
    projectsAvailable: !listQuery.isError && !activeQuery.isError,
    isLoading: listQuery.isLoading || activeQuery.isLoading,
    projects,
    resolved,
  };
}

type ProjectSwitcherProps = {
  state?: ActiveProjectState;
  className?: string;
};

export function ProjectSwitcher({ state, className = "" }: ProjectSwitcherProps) {
  const fallbackState = useActiveProjectState();
  const active = state ?? fallbackState;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const utils = trpc.useUtils();
  const autoSelectedRef = useRef<number | null>(null);

  const setActive = trpc.projects.setActive.useMutation({
    onSuccess: project => {
      toast.success(`تم التبديل إلى ${project ? projectLabel(project) : "المشروع المحدد"}`);
      void utils.invalidate();
    },
    onError: error => toast.error(error.message || "تعذّر تبديل المشروع"),
  });

  // اختيار تلقائي عندما يملك المستخدم مشروعًا واحدًا فقط.
  useEffect(() => {
    const target = active.resolved.autoSelectId;
    if (target == null) return;
    if (autoSelectedRef.current === target) return;
    autoSelectedRef.current = target;
    setActive.mutate({ projectId: target });
  }, [active.resolved.autoSelectId, setActive]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!active.projectsAvailable) return null;
  if (active.isLoading && active.projects.length === 0) return null;
  if (active.projects.length === 0) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-black text-amber-800 ${className}`}
        title="لم يتم تخصيص أي مشروع لحسابك بعد. راجع المدير لتخصيص مشروع."
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">لا يوجد مشروع مخصص</span>
        <span className="sm:hidden">لا مشروع</span>
      </div>
    );
  }

  const current = active.resolved.project;
  const canSwitch = active.projects.length > 1;

  const trigger = (
    <button
      type="button"
      onClick={() => canSwitch && setOpen(value => !value)}
      aria-haspopup={canSwitch ? "menu" : undefined}
      aria-expanded={canSwitch ? open : undefined}
      disabled={!canSwitch || setActive.isPending}
      title={canSwitch ? "تبديل المشروع النشط" : "المشروع المخصص لحسابك"}
      aria-label={canSwitch ? "تبديل المشروع النشط" : "المشروع النشط"}
      className={`inline-flex max-w-[min(70vw,14rem)] items-center gap-1.5 rounded-xl border border-[#dce7ee] bg-white px-2.5 py-2 text-[11px] font-black text-[#0d4f62] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65c2c8] dark:border-[#486673] dark:bg-[#182934] dark:text-[#bff1eb] sm:max-w-[14rem] ${
        canSwitch ? "hover:bg-[#e8f1f2]" : "cursor-default"
      } ${className}`}
    >
      {setActive.isPending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : current ? <ProjectVisualIcon project={current} /> : <Boxes className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">
        {current ? projectLabel(current) : active.resolved.needsExplicitSelection ? "اختر مشروعًا" : "لا مشروع نشط"}
      </span>
      {canSwitch && <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />}
    </button>
  );

  if (!canSwitch) return trigger;

  return (
    <div ref={containerRef} className="relative">
      {trigger}
      {open && (
        <div
          role="menu"
          dir="rtl"
          className="absolute right-0 top-12 z-50 w-[min(88vw,19rem)] overflow-hidden rounded-2xl border border-[#dce7ee] bg-white shadow-2xl dark:border-[#486673] dark:bg-[#182934] sm:left-0 sm:right-auto"
        >
          <div className="border-b border-[#eef3f5] px-3 py-2 dark:border-[#486673]">
            <p className="text-[11px] font-black text-[#102a43]">المشاريع المسموح بها</p>
            <p className="mt-0.5 text-[10px] font-bold text-slate-400">يتم تبديل البيانات والتقارير بالكامل عند التغيير</p>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {active.projects.map(project => {
              const isCurrent = current?.id === project.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  onClick={() => {
                    setOpen(false);
                    if (isCurrent) return;
                    setActive.mutate({ projectId: project.id });
                  }}
                    className={`flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-right text-[11px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#65c2c8] ${
                    isCurrent ? "bg-[#e8f7f6] text-[#0d4f62] dark:bg-[#235157] dark:text-[#bff1eb]" : "text-slate-600 hover:bg-[#f4f8fa] dark:text-[#d8e9ee] dark:hover:bg-[#294650]"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2"><ProjectVisualIcon project={project} /><span className="truncate">{projectOptionLabel(project)}</span></span>
                  {isCurrent && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectSwitcher;
