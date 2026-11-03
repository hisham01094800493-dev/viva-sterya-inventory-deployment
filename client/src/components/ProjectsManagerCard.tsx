import { useMemo, useState, type ReactNode } from "react";
import { Archive, Boxes, Loader2, Pencil, Plus, Save, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { projectOptionLabel, type ProjectOption } from "@/lib/projectSelection";
import { ProjectVisualIcon } from "./ProjectSwitcher";

type ManagedProject = ProjectOption & { description?: string | null; createdAt?: unknown };

function parseNumberList(value: string | null | undefined): number[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is number => Number.isInteger(item) && item > 0) : [];
  } catch {
    return [];
  }
}

function parseStringList(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

type Draft = { name: string; code: string; description: string };

const emptyDraft: Draft = { name: "", code: "", description: "" };

export function ProjectsManagerCard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [assigningProjectId, setAssigningProjectId] = useState<number | null>(null);

  const projectsQuery = trpc.projects.listAll.useQuery(undefined, { enabled: isAdmin, retry: false });
  const usersQuery = trpc.governance.users.useQuery(undefined, { enabled: isAdmin && assigningProjectId != null });
  const permissionsQuery = trpc.permissions.list.useQuery(undefined, { enabled: isAdmin && assigningProjectId != null });

  const utils = trpc.useUtils();
  const refresh = () => {
    void utils.projects.listAll.invalidate();
    void utils.projects.list.invalidate();
    void utils.projects.active.invalidate();
  };

  const createProject = trpc.projects.create.useMutation({
    onSuccess: project => {
      toast.success(`تم إنشاء المشروع ${project ? project.name : ""}`.trim());
      setDraft(emptyDraft);
      refresh();
    },
    onError: error => toast.error(error.message || "تعذّر إنشاء المشروع"),
  });

  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث بيانات المشروع");
      setEditingId(null);
      refresh();
    },
    onError: error => toast.error(error.message || "تعذّر تحديث المشروع"),
  });

  const archiveProject = trpc.projects.archive.useMutation({
    onSuccess: () => {
      toast.success("تم أرشفة المشروع. البيانات محفوظة ولم يُحذف شيء.");
      refresh();
    },
    onError: error => toast.error(error.message || "تعذّر أرشفة المشروع"),
  });

  const updatePermissions = trpc.permissions.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث المشاريع المسموح بها للمستخدم");
      void utils.permissions.list.invalidate();
    },
    onError: error => toast.error(error.message || "تعذّر تحديث صلاحيات المستخدم"),
  });

  const projects = (projectsQuery.data ?? []) as ManagedProject[];
  const activeProjects = useMemo(() => projects.filter(project => project.status === "active"), [projects]);

  if (!isAdmin) return null;

  if (projectsQuery.isError) {
    return (
      <Card className="settings-manager-card modern-card border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-sm dark:border dark:border-[#355663] dark:shadow-[0_12px_32px_rgba(0,0,0,0.22)] lg:col-span-2" id="settings-projects">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f1f2] text-[#0d4f62]">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <p className="font-black text-[#102a43]">إدارة المشاريع</p>
            <p className="mt-1 text-xs text-slate-400">نظام المشاريع غير مُفعّل على قاعدة البيانات الحالية بعد.</p>
          </div>
        </div>
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
          لم يتم تطبيق Migration 0036 على قاعدة البيانات، لذلك لا يمكن قراءة جدول المشاريع. الواجهة تعمل بشكلها الحالي دون أي تغيير،
          وستظهر هذه البطاقة تلقائيًا بعد تنفيذ الترحيل والموافقة عليه.
        </p>
      </Card>
    );
  }

  const submitCreate = () => {
    if (!draft.name.trim() || !draft.code.trim()) {
      toast.error("اسم المشروع وكوده مطلوبان");
      return;
    }
    createProject.mutate({
      name: draft.name.trim(),
      code: draft.code.trim(),
      description: draft.description.trim() ? draft.description.trim() : null,
    });
  };

  const startEdit = (project: ManagedProject) => {
    setEditingId(project.id);
    setEditDraft({ name: project.name, code: project.code, description: project.description ?? "" });
  };

  const submitEdit = () => {
    if (editingId == null) return;
    updateProject.mutate({
      id: editingId,
      name: editDraft.name.trim() || undefined,
      code: editDraft.code.trim() || undefined,
      description: editDraft.description.trim() ? editDraft.description.trim() : null,
    });
  };

  const toggleProjectForUser = (userId: number, projectId: number, record: { allowedScreens: string; allowedReports: string; allowedWarehouseIds: string; allowedProjectIds: string; readOnly: boolean }) => {
    const current = parseNumberList(record.allowedProjectIds);
    const next = current.includes(projectId) ? current.filter(id => id !== projectId) : [...current, projectId];
    updatePermissions.mutate({
      userId,
      allowedScreens: parseStringList(record.allowedScreens) as never,
      allowedReports: parseStringList(record.allowedReports) as never,
      allowedWarehouseIds: parseNumberList(record.allowedWarehouseIds),
      allowedProjectIds: next,
      readOnly: record.readOnly,
    });
  };

  return (
    <Card className="settings-manager-card modern-card border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-sm dark:border dark:border-[#355663] dark:shadow-[0_12px_32px_rgba(0,0,0,0.22)] lg:col-span-2" id="settings-projects">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f1f2] text-[#0d4f62]">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <p className="font-black text-[#102a43]">إدارة المشاريع</p>
            <p className="mt-1 text-xs leading-6 text-slate-400">
              كل مشروع له مخازنه وأصنافه وحركاته وتقاريره المستقلة. الأرشفة تُخفي المشروع ولا تحذف بياناته.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-[#e8f7f6] px-3 py-1 text-[11px] font-black text-[#0d4f62]">
          {activeProjects.length} مشروع نشط
        </span>
      </div>

      <div className="mb-5 grid gap-3 rounded-2xl border border-[#e5eef1] bg-[#fbfdff] p-3 dark:border-[#3c5d68] dark:bg-[#1b303b] sm:grid-cols-[1fr_180px_1fr_auto] sm:p-4">
        <input
          value={draft.name}
          onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
          placeholder="اسم المشروع"
          className="h-11 rounded-xl border border-[#b9d4d9] bg-white px-3 text-sm font-bold text-[#102a43] outline-none focus:border-[#0d7180] focus:ring-2 focus:ring-[#65c2c8]/30 dark:border-[#486673] dark:bg-[#182934] dark:text-[#f1fbfc]"
        />
        <input
          value={draft.code}
          onChange={event => setDraft(current => ({ ...current, code: event.target.value.toUpperCase() }))}
          placeholder="CODE"
          className="h-11 rounded-xl border border-[#b9d4d9] bg-white px-3 text-sm font-black tracking-widest text-[#102a43] outline-none focus:border-[#0d7180] focus:ring-2 focus:ring-[#65c2c8]/30 dark:border-[#486673] dark:bg-[#182934] dark:text-[#f1fbfc]"
        />
        <input
          value={draft.description}
          onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
          placeholder="وصف مختصر (اختياري)"
          className="h-11 rounded-xl border border-[#b9d4d9] bg-white px-3 text-sm text-[#102a43] outline-none focus:border-[#0d7180] focus:ring-2 focus:ring-[#65c2c8]/30 dark:border-[#486673] dark:bg-[#182934] dark:text-[#f1fbfc]"
        />
        <button
          type="button"
          onClick={submitCreate}
          disabled={createProject.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0d4f62] px-4 text-xs font-black text-white shadow-sm hover:bg-[#0a4150] disabled:opacity-60 sm:px-5"
        >
          {createProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          إنشاء
        </button>
      </div>

      {projectsQuery.isLoading ? (
        <p className="py-6 text-center text-xs font-bold text-slate-400">جارٍ تحميل المشاريع...</p>
      ) : projects.length === 0 ? (
        <p className="py-6 text-center text-xs font-bold text-slate-400">لا توجد مشاريع بعد.</p>
      ) : (
        <div className="space-y-2">
          {projects.map(project => {
            const isEditing = editingId === project.id;
            const isArchived = project.status === "archived";
            return (
              <div key={project.id} className="rounded-2xl border border-[#e5eef1] bg-white p-3 dark:border-[#3c5d68] dark:bg-[#182934] sm:p-4">
                {isEditing ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_150px_1fr_auto]">
                    <input
                      value={editDraft.name}
                      onChange={event => setEditDraft(current => ({ ...current, name: event.target.value }))}
                      className="h-10 rounded-xl border border-[#b9d4d9] bg-white px-3 text-sm font-bold outline-none focus:border-[#0d7180] focus:ring-2 focus:ring-[#65c2c8]/30 dark:border-[#486673] dark:bg-[#182934] dark:text-[#f1fbfc]"
                    />
                    <input
                      value={editDraft.code}
                      onChange={event => setEditDraft(current => ({ ...current, code: event.target.value.toUpperCase() }))}
                      className="h-10 rounded-xl border border-[#b9d4d9] bg-white px-3 text-sm font-black tracking-widest outline-none focus:border-[#0d7180] focus:ring-2 focus:ring-[#65c2c8]/30 dark:border-[#486673] dark:bg-[#182934] dark:text-[#f1fbfc]"
                    />
                    <input
                      value={editDraft.description}
                      onChange={event => setEditDraft(current => ({ ...current, description: event.target.value }))}
                      placeholder="الوصف"
                      className="h-10 rounded-xl border border-[#b9d4d9] bg-white px-3 text-sm outline-none focus:border-[#0d7180] focus:ring-2 focus:ring-[#65c2c8]/30 dark:border-[#486673] dark:bg-[#182934] dark:text-[#f1fbfc]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={submitEdit}
                        disabled={updateProject.isPending}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#0d4f62] px-3 text-[11px] font-black text-white sm:h-9"
                      >
                        {updateProject.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        حفظ
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#dce7ee] px-3 text-[11px] font-black text-slate-500 dark:border-[#486673] dark:text-[#d8e9ee] sm:h-9">
                        <X className="h-3.5 w-3.5" />
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex min-w-0 items-center gap-2 truncate text-sm font-black text-[#102a43]"><ProjectVisualIcon project={project} size="h-4 w-4" /><span className="truncate">{projectOptionLabel(project)}</span></p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">
                        {project.description?.trim() || "بدون وصف"}
                        {isArchived ? " · مؤرشف" : ""}
                      </p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                      <button
                        type="button"
                        onClick={() => setAssigningProjectId(current => (current === project.id ? null : project.id))}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#dce7ee] px-2.5 text-[11px] font-black text-[#0d4f62] hover:bg-[#eef7f7] dark:border-[#486673] dark:text-[#bff1eb] dark:hover:bg-[#294650] sm:min-h-8"
                      >
                        <UsersRound className="h-3.5 w-3.5" />
                        المستخدمون
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(project)}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#dce7ee] px-2.5 text-[11px] font-black text-[#0d4f62] hover:bg-[#eef7f7] dark:border-[#486673] dark:text-[#bff1eb] dark:hover:bg-[#294650] sm:min-h-8"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </button>
                      {!isArchived && project.code !== "MAIN" && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`أرشفة المشروع «${project.name}»؟ لن تُحذف أي بيانات، وسيختفي من قائمة المشاريع النشطة.`)) return;
                            archiveProject.mutate({ id: project.id });
                          }}
                          disabled={archiveProject.isPending}
                          className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#e6b7b2] px-2.5 text-[11px] font-black text-[#bd5147] hover:bg-[#fff4f2] dark:border-[#9e5a5a] dark:text-[#ffb4aa] dark:hover:bg-[#43282b] sm:col-span-1 sm:min-h-8"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          أرشفة
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {assigningProjectId === project.id && (
                  <div className="mt-3 rounded-xl border border-[#dcebee] bg-[#f7fbfc] p-3">
                    <p className="mb-2 text-[11px] font-black text-[#102a43]">المستخدمون المسموح لهم بهذا المشروع</p>
                    {usersQuery.isLoading || permissionsQuery.isLoading ? (
                      <p className="text-[11px] font-bold text-slate-400">جارٍ التحميل...</p>
                    ) : (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {(usersQuery.data ?? []).map((row: { id: number; name?: string | null; email?: string | null; role?: string }) => {
                          const record = (permissionsQuery.data ?? []).find((item: { userId: number }) => item.userId === row.id);
                          const allowed = record ? parseNumberList(record.allowedProjectIds).includes(project.id) : false;
                          const isAdminUser = row.role === "admin";
                          return (
                            <label key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold text-[#102a43]">
                              <span className="truncate">
                                {row.name || row.email || `مستخدم ${row.id}`}
                                {isAdminUser && <span className="ml-1 text-[10px] font-black text-[#0d7180]">(مدير — يرى الكل)</span>}
                              </span>
                              <input
                                type="checkbox"
                                checked={isAdminUser ? true : allowed}
                                disabled={isAdminUser || updatePermissions.isPending || !record}
                                onChange={() => record && toggleProjectForUser(row.id, project.id, record as never)}
                                className="h-4 w-4 accent-[#0d4f62]"
                              />
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Card({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={`modern-card rounded-3xl border-0 bg-white/90 p-5 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-sm md:p-7 ${className}`.trim()}>
      {children}
    </section>
  );
}

export default ProjectsManagerCard;
