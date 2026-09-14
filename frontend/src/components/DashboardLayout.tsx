import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import {
  ArrowDownToLine,
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
  const [query, setQuery] = useState(() => window.localStorage.getItem("smart-inventory-google-search-query") ?? "");
  const close = () => setOpen(false);
  const submit = () => {
    const value = query.trim();
    if (value.length < 2) return;
    window.localStorage.setItem("smart-inventory-google-search-query", value);
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", value);
    window.location.assign(url.toString());
  };
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="inline-flex gap-1.5 rounded-xl border-[#b8dce2] bg-white/80 px-2 text-[10px] font-black text-[#075b68] sm:px-3 sm:text-xs" title="البحث في Google"><Search className="h-4 w-4" /><span className="hidden sm:inline">بحث Google</span></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="flex min-h-[100dvh] w-screen max-w-none flex-col items-center justify-center rounded-none border-0 bg-white p-5 sm:min-h-0 sm:h-[560px] sm:w-[min(92vw,920px)] sm:rounded-[2rem] sm:border sm:border-[#e2e8f0] sm:p-12"><div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6"><Button type="button" variant="outline" size="icon" onClick={close} className="h-9 w-9 rounded-xl border-[#efb8b8] text-red-700" aria-label="إغلاق البحث"><X className="h-4 w-4" /></Button></div><div className="w-full max-w-3xl text-center"><div className="mb-8 select-none text-5xl font-medium tracking-[-0.08em] text-[#4285f4] sm:text-7xl"><span>G</span><span className="text-[#ea4335]">o</span><span className="text-[#fbbc05]">o</span><span className="text-[#4285f4]">g</span><span className="text-[#34a853]">l</span><span className="text-[#ea4335]">e</span></div><div className="flex h-14 items-center gap-3 rounded-full border border-[#dfe1e5] bg-white px-5 shadow-[0_1px_6px_rgba(32,33,36,.18)] transition focus-within:shadow-[0_1px_10px_rgba(32,33,36,.28)]"><Search className="h-5 w-5 shrink-0 text-slate-400" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") submit(); }} placeholder="ابحث في Google" className="min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400" aria-label="البحث في Google" /></div><div className="mt-7 flex flex-wrap justify-center gap-3"><Button type="button" onClick={submit} className="h-11 rounded-lg bg-[#f8f9fa] px-6 text-sm font-medium text-[#202124] shadow-sm hover:border-[#dadce0] hover:bg-[#f8f9fa]">بحث Google</Button><Button type="button" onClick={() => { setQuery(""); window.localStorage.removeItem("smart-inventory-google-search-query"); }} className="h-11 rounded-lg bg-[#f8f9fa] px-6 text-sm font-medium text-[#202124] shadow-sm hover:border-[#dadce0] hover:bg-[#f8f9fa]">مسح</Button></div><p className="mt-8 text-xs text-slate-400">اضغط Enter أو زر بحث Google لفتح صفحة Google الطبيعية.</p></div></DialogContent></Dialog>
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
