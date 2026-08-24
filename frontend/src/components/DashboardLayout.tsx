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
  Settings2,
} from "lucide-react";
import { useLocation } from "wouter";
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
          <div className="hidden items-center gap-3 sm:flex">
            <div className="rounded-full border border-[#dce7ee] bg-white px-4 py-2 text-xs font-bold text-slate-500">نظام متصل • البيانات محفوظة</div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0d4f62] text-xs font-black text-white">{user.name?.charAt(0) ?? "م"}</div>
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] w-full min-w-0 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">{children}</main>
      </SidebarInset>
    </div>
  );
}
