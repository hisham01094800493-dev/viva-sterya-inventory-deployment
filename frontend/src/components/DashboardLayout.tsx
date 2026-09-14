import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpFromLine,
  BellRing,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  PanelRight,
  Package,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "نظرة عامة", path: "/" },
  { icon: Package, label: "الأصناف والمخزون", path: "/items" },
  { icon: ArrowDownToLine, label: "إضافات المخزون", path: "/additions" },
  { icon: ArrowUpFromLine, label: "أذونات الصرف", path: "/disbursements" },
  { icon: ArrowLeftRight, label: "التحويلات والمرتجعات", path: "/transfers" },
  { icon: BellRing, label: "التنبيهات", path: "/alerts" },
  { icon: FileBarChart, label: "التقارير", path: "/reports" },
  { icon: Settings2, label: "الإعدادات", path: "/settings" },
];

const GOOGLE_SEARCH_ENGINE_ID = "01b5a823a6a9140c6";

function GoogleSearchButton() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  const focusSearch = () => window.setTimeout(() => rootRef.current?.querySelector<HTMLInputElement>("input.gsc-input")?.focus(), 0);
  const runSearch = () => { const input = rootRef.current?.querySelector<HTMLInputElement>("input.gsc-input"); if (!input || input.value.trim().length < 2) { toast.error("اكتب عبارة بحث من كلمتين على الأقل"); focusSearch(); return; } const query = input.value.trim().replace(/\s+(أخبار|صور|فيديوهات|مواقع عربية)$/i, ""); const label = filter === "news" ? "أخبار" : filter === "images" ? "صور" : filter === "videos" ? "فيديوهات" : filter === "arabic" ? "مواقع عربية" : ""; input.value = label ? `${query} ${label}` : query; window.localStorage.setItem("smart-inventory-google-search-query", query); input.dispatchEvent(new Event("input", { bubbles: true })); rootRef.current?.querySelector<HTMLButtonElement>("button.gsc-search-button-v2")?.click(); };
  const clearSearch = () => { const input = rootRef.current?.querySelector<HTMLInputElement>("input.gsc-input"); if (input) { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); } window.localStorage.removeItem("smart-inventory-google-search-query"); focusSearch(); };
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  useEffect(() => {
    if (!open || document.querySelector("script[data-smart-inventory-render-cse]")) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://cse.google.com/cse.js?cx=${GOOGLE_SEARCH_ENGINE_ID}`;
    script.dataset.smartInventoryRenderCse = "true";
    document.head.appendChild(script);
  }, [open]);
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const root = rootRef.current;
    const observer = new MutationObserver(() => {
      const input = root.querySelector<HTMLInputElement>("input.gsc-input");
      if (input) {
        setReady(true);
        const saved = window.localStorage.getItem("smart-inventory-google-search-query");
        if (saved && !input.value) input.value = saved;
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const root = rootRef.current;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const input = target.closest(".gsc-search-box")?.querySelector<HTMLInputElement>("input.gsc-input");
      if (input?.value.trim()) window.localStorage.setItem("smart-inventory-google-search-query", input.value.trim());
      const link = target.closest<HTMLAnchorElement>(".gsc-result a.gs-title, .gsc-result a.gs-visibleUrl");
      if (link?.href) { event.preventDefault(); event.stopPropagation(); window.open(link.href, "_blank", "noopener,noreferrer"); }
    };
    root.addEventListener("click", onClick, true);
    return () => root.removeEventListener("click", onClick, true);
  }, [open]);
  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="inline-flex gap-1.5 rounded-xl border-[#b8dce2] bg-white/80 px-2 text-[10px] font-black text-[#075b68] sm:px-3 sm:text-xs" title="البحث في Google"><Search className="h-4 w-4" /><span className="hidden sm:inline">بحث Google</span></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="flex h-[100dvh] w-screen max-w-none flex-col rounded-none border-0 bg-[#fbffff] p-0 sm:h-[94vh] sm:w-[96vw] sm:max-w-[1180px] sm:rounded-[2rem] sm:border sm:border-[#cfe7ea]"><DialogHeader className="sticky top-0 z-10 flex-row items-center justify-between border-b border-[#dcecef] bg-[#fbffff]/95 px-4 py-3 backdrop-blur sm:px-7 sm:py-4"><DialogTitle className="flex items-center gap-2 text-base text-[#075b68] sm:text-xl"><Search className="h-5 w-5" /> البحث في Google داخل التطبيق</DialogTitle><div className="flex items-center gap-1.5"><Button type="button" variant="outline" size="sm" onClick={focusSearch} className="h-9 rounded-xl border-[#b8dce2] px-2.5 text-xs font-black text-[#075b68]"><Search className="ml-1 h-4 w-4" /> بحث</Button><Button type="button" variant="outline" size="sm" onClick={close} className="h-9 rounded-xl border-[#b8dce2] px-2.5 text-xs font-black text-[#075b68]"><ArrowLeft className="ml-1 h-4 w-4" /> رجوع</Button><Button type="button" variant="outline" size="sm" onClick={close} className="h-9 rounded-xl border-[#efb8b8] px-2.5 text-xs font-black text-red-700" aria-label="إغلاق البحث"><X className="h-4 w-4" /><span className="hidden sm:inline">إغلاق</span></Button></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-7 sm:py-6"><div ref={rootRef} className="mx-auto min-h-[70vh] w-full max-w-5xl rounded-2xl border border-[#dcecef] bg-white p-3 shadow-sm sm:p-6"><div className="mb-3 flex items-center justify-between rounded-xl bg-[#eff8f8] px-3 py-2 text-xs font-bold text-[#075b68]"><span>{ready ? "اكتب عبارة البحث ثم اضغط بحث" : "جارٍ تحميل محرك البحث..."}</span><span className="text-slate-400">اضغط Esc للإغلاق</span></div><div className="gcse-search" /><div className="mt-4 rounded-2xl border border-[#dcecef] bg-[#f8fcfc] p-3"><div className="flex flex-wrap items-center gap-2"><select value={filter} onChange={event => setFilter(event.target.value)} className="h-10 rounded-xl border border-[#b8dce2] bg-white px-3 text-xs font-bold text-[#075b68] outline-none"><option value="all">كل النتائج</option><option value="arabic">مواقع عربية</option><option value="news">أخبار</option><option value="images">صور</option><option value="videos">فيديوهات</option></select><Button type="button" onClick={runSearch} className="h-10 flex-1 rounded-xl bg-[#0d7180] text-xs font-black text-white sm:flex-none sm:px-8"><Search className="ml-1 h-4 w-4" /> بحث داخل التطبيق</Button><Button type="button" variant="outline" onClick={clearSearch} className="h-10 rounded-xl border-[#b8dce2] px-4 text-xs font-bold text-[#075b68]">مسح</Button></div><p className="mt-2 text-[11px] text-slate-500">اختر نوع النتائج ثم اضغط زر البحث أسفل مربع البحث.</p></div><p className="mt-4 text-center text-xs text-slate-400">اضغط على أي نتيجة لفتحها في تبويب جديد.</p></div></div></DialogContent></Dialog>
  </>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="min-h-svh bg-[#f4f7fb] flex items-center justify-center p-6" dir="rtl">
        <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-10 text-center shadow-[0_24px_80px_rgba(18,44,84,0.12)] backdrop-blur">
          <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0d4f62] text-white shadow-lg shadow-[#0d4f62]/20">
            <Package className="h-8 w-8" />
          </div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-[#d08a3b]">SMART INVENTORY</p>
          <h1 className="mb-3 text-3xl font-black tracking-tight text-[#102a43]">إدارة المخزون بوضوح</h1>
          <p className="mb-8 text-sm leading-7 text-slate-500">سجّل الدخول للوصول إلى لوحة التحكم وحركات المخزون والتنبيهات الذكية.</p>
          <Button onClick={() => startLogin()} size="lg" className="h-12 w-full rounded-xl bg-[#0d4f62] text-white shadow-lg shadow-[#0d4f62]/20 hover:bg-[#0a4150]">
            تسجيل الدخول للمتابعة
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <DashboardLayoutContent user={user}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ children, user }: { children: React.ReactNode; user: NonNullable<ReturnType<typeof useAuth>["user"]> }) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const activeMenuItem = menuItems.find(item => item.path === location) ?? menuItems[0];
  const { logout } = useAuth();

  return (
    <div className="flex min-h-svh w-full min-w-0 flex-1 overflow-x-hidden bg-[#f4f7fb]" dir="rtl">
        <Sidebar side="right" collapsible="icon" className="border-l border-[#dce7ee] border-r-0 bg-[#fbfdff]">
          <SidebarHeader className="h-24 justify-center border-b border-[#e7eef3] px-4">
            <div className="flex items-center gap-3">
              <button onClick={toggleSidebar} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d4f62] text-white shadow-md shadow-[#0d4f62]/15 transition-transform active:scale-95" aria-label="طي القائمة">
                <PanelRight className="h-5 w-5" />
              </button>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-black tracking-[0.28em] text-[#d08a3b]">SMART INVENTORY</p>
                  <p className="truncate text-sm font-bold text-[#102a43]">منصة المخزون</p>
                </div>
              )}
            </div>
          </SidebarHeader>
          <SidebarContent className="px-3 py-5">
            <div className={`mb-3 px-3 text-[10px] font-black tracking-[0.22em] text-slate-400 ${isCollapsed ? "sr-only" : ""}`}>مساحات العمل</div>
            <SidebarMenu className="gap-1.5">
              {menuItems.map(item => {
                const Icon = item.icon;
                const active = activeMenuItem.path === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-11 rounded-xl px-3 text-sm font-bold transition-all ${active ? "bg-[#e8f1f2] text-[#0d4f62] shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-[#0d4f62]"}`}
                    >
                      <Icon className={`h-[18px] w-[18px] ${active ? "text-[#d08a3b]" : ""}`} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t border-[#e7eef3] p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl p-2 text-right transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0d4f62]">
                  <Avatar className="h-9 w-9 border border-[#d6e4e8] bg-[#e8f1f2]">
                    <AvatarFallback className="bg-[#e8f1f2] text-sm font-black text-[#0d4f62]">{user.name?.charAt(0) ?? "م"}</AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-[#102a43]">{user.name || "مستخدم النظام"}</span>
                      <span className="mt-1 block truncate text-[10px] text-slate-400">{user.email || "حساب النظام"}</span>
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 rounded-xl p-1">
                <DropdownMenuItem onClick={logout} className="cursor-pointer gap-2 rounded-lg text-red-600 focus:text-red-600">
                  <LogOut className="h-4 w-4" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
      <SidebarInset className="w-full max-w-full min-w-0 flex-1 bg-[#f4f7fb]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e3edf2] bg-[#f4f7fb]/90 px-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="h-9 w-9 rounded-xl bg-white text-[#0d4f62] shadow-sm hover:bg-[#e8f1f2]" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d08a3b]">Smart Inventory / إدارة المخزون</p>
              <h1 className="text-lg font-black text-[#102a43]">{activeMenuItem.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <GoogleSearchButton />
            <div className="rounded-full border border-[#dce7ee] bg-white px-4 py-2 text-xs font-bold text-slate-500">نظام متصل • البيانات محفوظة</div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0d4f62] text-xs font-black text-white">{user.name?.charAt(0) ?? "م"}</div>
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] w-full min-w-0 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">{children}</main>
      </SidebarInset>
    </div>
  );
}
