import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BellRing,
  Search,
  MessageCircle,
  ClipboardCheck,
  FileBarChart,
  ShieldCheck,
  LayoutDashboard,
  LogOut,
  PanelRight,
  Moon,
  Sun,
  Package,
  Plus,
  Settings2,
  Truck,
  Warehouse,
  RotateCcw,
  Upload,
  UserRound,
  X,
  ChevronDown,
  Boxes,
  UsersRound,
  ReceiptText,
  MessagesSquare,
  ChartNoAxesCombined,
  SlidersHorizontal,
  ClipboardList,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { canCreateInventoryItems } from "@/lib/itemCreatePermission";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import OfflineDataNotice from "@/components/OfflineDataNotice";
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
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { inventoryQueryOptions } from "@/lib/queryOptions";
import { findNewUnreadNotification, formatIncomingNotification, getNotificationTone, getSeenNotificationIds, rememberUnreadNotificationIds } from "@/lib/notificationCenter";
import { enableNotificationAudioPreference, playNotificationTone, unlockNotificationAudio } from "@/lib/notificationAudio";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { GlobalVoiceSearch } from "./GlobalVoiceSearch";
import PwaVersionCard from "./PwaVersionCard";
import ChatFloatingBubble from "./ChatFloatingBubble";
import { OnboardingTour } from "./OnboardingTour";

export function buildWarehouseNavigationItems(warehouses: Array<{ slot: number; name: string }>) { return warehouses.map(item => ({ icon: Warehouse, label: item.name, path: `/warehouses/${item.slot}` })); }

export function clampQuickActionsPosition(position: { x: number; y: number }, viewport: { width: number; height: number }, buttonSize = 56) {
  return {
    x: Math.max(8, Math.min(position.x, Math.max(8, viewport.width - buttonSize - 8))),
    y: Math.max(8, Math.min(position.y, Math.max(8, viewport.height - buttonSize - 8))),
  };
}

export function snapQuickActionsToNearestEdge(position: { x: number; y: number }, viewport: { width: number; height: number }, buttonSize = 56) {
  const clamped = clampQuickActionsPosition(position, viewport, buttonSize);
  const rightX = Math.max(8, viewport.width - buttonSize - 8);
  const bottomY = Math.max(8, viewport.height - buttonSize - 8);
  const edge = clamped.x <= rightX - clamped.x ? "left" : "right";
  return { ...clamped, x: edge === "left" ? 8 : rightX, y: bottomY, edge } as const;
}

export function GoogleSearchButton() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => window.localStorage.getItem("smart-inventory-google-search-query") ?? "");
  const close = () => setOpen(false);
  const submit = () => {
    const value = query.trim();
    if (value.length < 2) return;
    window.localStorage.setItem("smart-inventory-google-search-query", value);
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", value);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="inline-flex gap-1.5 rounded-xl border-[#b8dce2] bg-white/80 px-2 text-[10px] font-black text-[#075b68] sm:px-3 sm:text-xs" title="البحث في Google"><Search className="h-4 w-4" /><span className="hidden sm:inline">بحث Google</span></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="flex min-h-[100dvh] w-screen max-w-none flex-col items-center justify-center rounded-none border-0 bg-white p-5 sm:min-h-0 sm:h-[560px] sm:w-[min(92vw,920px)] sm:rounded-[2rem] sm:border sm:border-[#e2e8f0] sm:p-12"><div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6"><Button type="button" variant="outline" size="icon" onClick={close} className="h-9 w-9 rounded-xl border-[#efb8b8] text-red-700" aria-label="إغلاق البحث"><X className="h-4 w-4" /></Button></div><div className="w-full max-w-3xl text-center"><div className="mb-8 select-none text-5xl font-medium tracking-[-0.08em] text-[#4285f4] sm:text-7xl"><span>G</span><span className="text-[#ea4335]">o</span><span className="text-[#fbbc05]">o</span><span className="text-[#4285f4]">g</span><span className="text-[#34a853]">l</span><span className="text-[#ea4335]">e</span></div><div className="flex h-14 items-center gap-3 rounded-full border border-[#dfe1e5] bg-white px-5 shadow-[0_1px_6px_rgba(32,33,36,.18)] transition focus-within:shadow-[0_1px_10px_rgba(32,33,36,.28)]"><Search className="h-5 w-5 shrink-0 text-slate-400" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") submit(); }} placeholder="ابحث في Google" className="min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400" aria-label="البحث في Google" /></div><div className="mt-7 flex flex-wrap justify-center gap-3"><Button type="button" onClick={submit} className="h-11 rounded-lg bg-[#f8f9fa] px-6 text-sm font-medium text-[#202124] shadow-sm hover:border-[#dadce0] hover:bg-[#f8f9fa]">بحث Google</Button><Button type="button" onClick={() => { setQuery(""); window.localStorage.removeItem("smart-inventory-google-search-query"); }} className="h-11 rounded-lg bg-[#f8f9fa] px-6 text-sm font-medium text-[#202124] shadow-sm hover:border-[#dadce0] hover:bg-[#f8f9fa]">مسح</Button></div><p className="mt-8 text-xs text-slate-400">اضغط Enter أو زر بحث Google لفتح صفحة Google الطبيعية.</p></div></DialogContent></Dialog>
  </>;
}

type NavigationItem = { icon: React.ComponentType<{ className?: string }>; label: string; path: string; mobileLabel?: string };
export type NavigationGroup = { id: string; icon: React.ComponentType<{ className?: string }>; label: string; description: string; items: NavigationItem[] };
type PreviewPermissions = { userId: number; userName?: string | null; userEmail?: string | null; allowedScreens: string[]; allowedReports: string[]; readOnly: boolean };
const MOVEMENT_FINANCIAL_PERMISSION = "warehouse-financial-details";
const MOVEMENT_FINANCIAL_PREFERENCE_KEY = "movement-financial-columns-v1";

export const SIDEBAR_VISUAL_CLASSES = {
  surface: "smart-sidebar-surface",
  header: "smart-sidebar-header",
  footer: "smart-sidebar-footer",
  sectionLabel: "smart-sidebar-section-label",
  navigation: "smart-sidebar-navigation",
  navigationItem: "smart-sidebar-nav-item",
  activeNavigationItem: "smart-sidebar-nav-item-active",
  icon: "smart-sidebar-nav-icon",
  profile: "smart-sidebar-profile",
} as const;

export function canAccessMigrationImport(role?: string | null) {
  return role === "admin";
}

export function isNavigationPathActive(path: string, location: string) {
  if (path.includes("?")) return location === path;
  return location === path || location.startsWith(`${path}/`) || location.startsWith(`${path}?`);
}

export function buildNavigationGroups(items: NavigationItem[], governanceItems: NavigationItem[] = []): NavigationGroup[] {
  const byPath = new Map(items.map(item => [item.path, item]));
  const pick = (paths: string[]) => paths.map(path => byPath.get(path)).filter((item): item is NavigationItem => Boolean(item));
  return [
    { id: "home", icon: LayoutDashboard, label: "الرئيسية", description: "ملخص سريع لحالة العمل", items: pick(["/"]) },
    { id: "inventory", icon: Boxes, label: "المخازن والمخزون", description: "الأصناف والمخازن والأرصدة", items: pick(["/items", "/warehouses", "/inventory-audit"]) },
    { id: "suppliers", icon: Truck, label: "الموردون", description: "دليل الموردين وكشوف الحساب", items: pick(["/suppliers"]) },
    { id: "customers", icon: UsersRound, label: "العملاء وجهات الصرف", description: "العملاء والجهات وكشوف الحساب", items: pick(["/customers"]) },
    { id: "movements", icon: ReceiptText, label: "أذونات المخازن العامة", description: "الإضافة والصرف والتحويل والتسويات", items: pick(["/additions", "/disbursements", "/transfers", "/stock-adjustments"]) },
    { id: "alerts", icon: MessagesSquare, label: "التنبيهات المهمة", description: "محادثات الفريق والتنبيهات", items: pick(["/chat", "/alerts"]) },
    { id: "reports", icon: ChartNoAxesCombined, label: "التقارير", description: "تقارير الحركة والأرصدة والفروقات", items: pick(["/reports"]) },
    { id: "settings", icon: SlidersHorizontal, label: "الإعدادات والحماية", description: "الإعدادات والنسخ والصلاحيات", items: [...pick(["/settings"]), ...governanceItems] },
  ].filter(group => group.items.length > 0);
}

export function buildGovernanceNavigationItems(role?: string | null): NavigationItem[] {
  if (canAccessMigrationImport(role)) {
    return [
      { icon: ShieldCheck, label: "مركز النسخ والحماية", path: "/governance?tab=backup-center" },
      { icon: ShieldCheck, label: "النسخ الاحتياطية السابقة", path: "/governance?tab=backups" },
      { icon: UserRound, label: "المستخدمون والصلاحيات", path: "/governance?tab=users" },
      { icon: Upload, label: "استيراد حزمة الترحيل", path: "/migration-import" },
      { icon: RotateCcw, label: "بدء استخدام جديد", path: "/governance?tab=reset" },
    ];
  }
  return role === "manager" ? [{ icon: ShieldCheck, label: "مركز النسخ والحماية", path: "/governance?tab=backup-center" }] : [];
}

export function WarehouseNavigationList({ items, activePath, onNavigate, darkMode = false }: { items: NavigationItem[]; activePath?: string; onNavigate: (path: string) => void; darkMode?: boolean }) {
  return (
    <SidebarMenu className={`${SIDEBAR_VISUAL_CLASSES.navigation} gap-2`}>
      {items.map(item => {
        const Icon = item.icon;
        const active = activePath === item.path;
        return (
          <SidebarMenuItem key={item.path}>
            <SidebarMenuButton
              isActive={active}
              onClick={() => onNavigate(item.path)}
              tooltip={item.label}
              className={`smart-interactive group h-12 rounded-2xl px-3 text-[13px] font-black transition-all duration-200 ${SIDEBAR_VISUAL_CLASSES.navigationItem} ${active ? SIDEBAR_VISUAL_CLASSES.activeNavigationItem : ""}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${SIDEBAR_VISUAL_CLASSES.icon}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function GroupedNavigation({ groups, location, isCollapsed, onNavigate, onExpandSidebar }: { groups: NavigationGroup[]; location: string; isCollapsed: boolean; onNavigate: (path: string) => void; onExpandSidebar: () => void }) {
  const activeGroupId = groups.find(group => group.items.some(item => isNavigationPathActive(item.path, location)))?.id ?? groups[0]?.id;
  const [pressedPath, setPressedPath] = useState<string | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("smart-inventory-sidebar-groups") || "{}");
      return typeof saved === "object" && saved ? saved : {};
    } catch { return {}; }
  });
  useEffect(() => {
    if (!activeGroupId) return;
    setExpanded(current => current[activeGroupId] ? current : { ...current, [activeGroupId]: true });
  }, [activeGroupId]);
  useEffect(() => () => { if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current); }, []);
  const navigateItem = (path: string) => {
    setPressedPath(path);
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => setPressedPath(current => current === path ? null : current), 240);
    onNavigate(path);
  };
  const toggleGroup = (groupId: string) => {
    if (isCollapsed) onExpandSidebar();
    setExpanded(current => {
      const next = { ...current, [groupId]: !current[groupId] };
      window.localStorage.setItem("smart-inventory-sidebar-groups", JSON.stringify(next));
      return next;
    });
  };
  return <div className={`${SIDEBAR_VISUAL_CLASSES.navigation} space-y-2`}>
    {groups.map(group => {
      const GroupIcon = group.icon;
      const groupActive = group.id === activeGroupId;
      const groupExpanded = isCollapsed ? false : Boolean(expanded[group.id] ?? groupActive);
      return <div key={group.id} className={`smart-sidebar-group ${groupActive ? "smart-sidebar-group-active" : ""}`}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={() => toggleGroup(group.id)} tooltip={group.label} className={`smart-interactive group h-14 rounded-2xl px-3 text-[13px] font-black transition-all duration-200 ${SIDEBAR_VISUAL_CLASSES.navigationItem} ${groupActive ? "smart-sidebar-group-trigger-active" : ""}`} aria-expanded={groupExpanded}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${SIDEBAR_VISUAL_CLASSES.icon}`}><GroupIcon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 flex-1 text-right"><span className="block truncate">{group.label}</span><span className="mt-0.5 block truncate text-[10px] font-semibold opacity-65">{group.description}</span></span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${groupExpanded ? "rotate-180" : ""}`} />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className={`smart-sidebar-submenu overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none ${groupExpanded ? "max-h-96 opacity-100" : "pointer-events-none max-h-0 opacity-0"}`}>
          <SidebarMenu className="mt-1 gap-1 border-r border-[#75b9bd]/30 pr-3">
            {group.items.map(item => {
              const ItemIcon = item.icon;
              const active = isNavigationPathActive(item.path, location);
              return <SidebarMenuItem key={item.path}>
                <SidebarMenuButton type="button" isActive={active} onClick={() => navigateItem(item.path)} tooltip={item.label} aria-current={active ? "page" : undefined} className={`smart-interactive h-10 rounded-xl px-3 text-xs font-bold ${SIDEBAR_VISUAL_CLASSES.navigationItem} ${active ? SIDEBAR_VISUAL_CLASSES.activeNavigationItem : ""} ${pressedPath === item.path ? "smart-sidebar-click-flash" : ""}`}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/45"><ItemIcon className="h-3.5 w-3.5" /></span><span className="truncate">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>;
            })}
          </SidebarMenu>
        </div>
      </div>;
    })}
  </div>;
}

const menuItems = [
  { icon: LayoutDashboard, label: "نظرة عامة", path: "/" },
  { icon: Package, label: "المخزون", path: "/items" },
  { icon: ClipboardList, label: "مراجعة المخزون", path: "/inventory-audit" },
  { icon: ArrowDownToLine, label: "إضافات المخزون", path: "/additions" },
  { icon: ArrowUpFromLine, label: "أذونات الصرف", path: "/disbursements" },
  { icon: ArrowLeftRight, label: "التحويلات والمرتجعات", path: "/transfers" },
  { icon: BellRing, label: "التنبيهات", path: "/alerts" },
  { icon: MessageCircle, label: "محادثات فريق العمل", path: "/chat" },
  { icon: FileBarChart, label: "التقارير", path: "/reports" },
  { icon: ClipboardCheck, label: "التسويات المخزنية", path: "/stock-adjustments" },
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
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-[#d08a3b]">Smart Inventory</p>
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

function NotificationBell({ chatEnabled = true }: { chatEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [incomingNotice, setIncomingNotice] = useState<string | null>(null);
  const [incomingChatNotice, setIncomingChatNotice] = useState<string | null>(null);
  const lastChatMessageId = useRef<number | null>(null);
  const { user } = useAuth();
  const notifications = trpc.notifications.list.useQuery(undefined, { refetchInterval: 5000, refetchOnWindowFocus: true });
  const chatConversations = trpc.chat.conversations.useQuery(undefined, { enabled: chatEnabled, refetchInterval: 15000 });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => void notifications.refetch() });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => void notifications.refetch() });
  const clearRead = trpc.notifications.clearRead.useMutation({ onSuccess: result => { void notifications.refetch(); toast.success(result.deleted ? `تم مسح ${result.deleted} إشعار مقروء` : "لا توجد إشعارات مقروءة للمسح"); }, onError: error => toast.error(error.message || "تعذر مسح الإشعارات المقروءة") });
  const clearMine = trpc.notifications.clearMine.useMutation({ onSuccess: result => { void notifications.refetch(); toast.success(result.deleted ? `تم حذف ${result.deleted} إشعار` : "لا توجد إشعارات مباشرة للحذف"); }, onError: error => toast.error(error.message || "تعذر حذف الإشعارات") });
  const rows = notifications.data ?? [];
  const unreadCount = rows.filter(row => !row.isRead).length;
  useEffect(() => {
    enableNotificationAudioPreference();
    const unlock = () => { enableNotificationAudioPreference(); unlockNotificationAudio(); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);
  useEffect(() => {
    const chatRows = chatConversations.data ?? [];
    const newestUnread = chatRows.filter(row => Number(row.unreadCount ?? 0) > 0 && row.latestMessage).sort((a, b) => Number(b.latestMessage?.id ?? 0) - Number(a.latestMessage?.id ?? 0))[0];
    const newestId = Number(newestUnread?.latestMessage?.id ?? 0);
    if (!newestId) return;
    if (lastChatMessageId.current === null) { lastChatMessageId.current = newestId; return; }
    if (newestId <= lastChatMessageId.current) return;
    lastChatMessageId.current = newestId;
    const sender = newestUnread?.latestMessage?.senderName || "مستخدم";
    const body = newestUnread?.latestMessage?.body || newestUnread?.latestMessage?.attachmentName || "مرفق جديد";
    setIncomingChatNotice(`رسالة جديدة من ${sender} في ${newestUnread?.title}: ${body}`);
    const timer = window.setTimeout(() => setIncomingChatNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [chatConversations.data]);
  useEffect(() => {
    if (!notifications.data) return;
    const seenIds = getSeenNotificationIds(window.sessionStorage);
    const newestUnread = findNewUnreadNotification(rows, seenIds);
    rememberUnreadNotificationIds(window.sessionStorage, rows);
    if (!newestUnread) return;
    setIncomingNotice(formatIncomingNotification(newestUnread));
    const soundEnabled = window.localStorage.getItem("smart-inventory-notification-sound") !== "off";
    if (soundEnabled) void playNotificationTone(getNotificationTone(newestUnread.priority));
    const timer = window.setTimeout(() => setIncomingNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notifications.data, rows]);
  return <div className="relative">
    {incomingNotice && <button type="button" onClick={() => window.location.assign("/alerts")} role="status" aria-live="polite" title="فتح صفحة التنبيهات" className="fixed left-1/2 top-16 z-[60] w-[min(calc(100vw-2rem),380px)] -translate-x-1/2 rounded-2xl border border-[#b9d4d9] bg-white px-4 py-3 text-center text-sm font-black text-[#0d4f62] shadow-2xl transition hover:-translate-y-0.5 hover:border-[#0d7180] hover:shadow-[0_16px_35px_rgba(13,79,98,0.18)]">{incomingNotice}<span className="mt-1 block text-[11px] font-bold text-slate-400">اضغط لفتح صفحة التنبيهات</span></button>}
    {incomingChatNotice && <button type="button" onClick={() => window.location.assign("/chat")} role="status" aria-live="polite" title="فتح محادثات فريق العمل" className="fixed left-1/2 top-[8.75rem] z-[60] w-[min(calc(100vw-2rem),420px)] -translate-x-1/2 rounded-2xl border border-[#8fd1d0] bg-[#e8f7f6] px-4 py-3 text-center text-sm font-black text-[#0d4f62] shadow-2xl transition hover:-translate-y-0.5 hover:border-[#0d7180]">رسالة جديدة في محادثات فريق العمل<span className="mt-1 block truncate text-xs font-bold text-slate-600">{incomingChatNotice}</span><span className="mt-1 block text-[11px] font-bold text-[#0d7180]">اضغط لفتح المحادثة</span></button>}
    <button type="button" onPointerDown={() => unlockNotificationAudio()} onClick={() => setOpen(value => !value)} aria-label={`الإشعارات${unreadCount ? ` (${unreadCount} غير مقروءة)` : ""}`} className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[#dce7ee] bg-white text-[#0d4f62] shadow-sm transition hover:bg-[#e8f1f2]">
      <BellRing className="h-4 w-4" />{unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#bd5147] px-1 text-[10px] font-black text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <div className="fixed left-1/2 top-16 z-50 w-[min(calc(100vw-1.5rem),360px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-[#dce7ee] bg-white shadow-2xl md:absolute md:left-0 md:top-11 md:w-[min(92vw,360px)] md:translate-x-0" dir="rtl">
      <div className="flex items-center justify-between gap-3 border-b border-[#eef3f5] px-4 py-3"><div><p className="font-black text-[#102a43]">الإشعارات</p><p className="mt-1 text-[11px] text-slate-400">{unreadCount ? `${unreadCount} غير مقروءة` : "لا توجد إشعارات غير مقروءة"}</p></div><div className="flex flex-wrap items-center justify-end gap-2">{unreadCount > 0 && <button type="button" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} className="text-[11px] font-black text-[#0d7180]">تحديد الكل كمقروء</button>}{user?.role === "admin" && rows.some(row => row.isRead) && <button type="button" onClick={() => { if (window.confirm("سيتم حذف الإشعارات المقروءة لهذا الحساب فقط، ولن تُحذف الإشعارات غير المقروءة أو سجل تتبع قراءة المستلمين. هل تريد المتابعة؟")) clearRead.mutate(); }} disabled={clearRead.isPending} title="حذف الإشعارات المقروءة فقط" className="text-[11px] font-black text-[#bd5147]">{clearRead.isPending ? "جارٍ المسح..." : "مسح المقروءة"}</button>}{rows.some(row => row.recipientUserId && row.recipientUserId > 0) && <button type="button" onClick={() => { if (window.confirm("سيتم حذف إشعارات حسابك المباشرة فقط. هل تريد المتابعة؟")) clearMine.mutate(); }} disabled={clearMine.isPending} title="حذف إشعارات حسابك المباشرة" className="text-[11px] font-black text-[#bd5147]">{clearMine.isPending ? "جارٍ المسح..." : "حذف إشعاراتي"}</button>}</div></div>
      <div className="max-h-80 overflow-y-auto">{notifications.isLoading ? <p className="p-6 text-center text-sm text-slate-400">جاري تحميل الإشعارات...</p> : !rows.length ? <p className="p-6 text-center text-sm text-slate-400">لا توجد إشعارات مخصصة حالياً.</p> : rows.slice(0, 20).map(row => <button key={row.id} type="button" onClick={() => { if (!row.isRead) markRead.mutate({ id: row.id }); window.location.assign(row.link || "/alerts"); }} className={`block w-full border-b border-[#f1f5f6] px-4 py-3 text-right transition hover:bg-[#f7fbfc] ${row.isRead ? "bg-white" : "bg-[#fffaf0]"}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${row.priority === "critical" ? "bg-red-600" : row.priority === "high" ? "bg-orange-500" : "bg-[#0d7180]"}`} /><span className="min-w-0 flex-1"><span className="block font-black text-[#102a43]">{row.title}</span><span className="mt-1 block text-xs leading-6 text-slate-600">{row.message}</span><span className="mt-1 block text-[10px] text-slate-400">{new Date(row.createdAt).toLocaleString("ar-EG")}</span></span></div></button>)}</div>
    </div>}
  </div>;
}

function FloatingQuickActions({ onNavigate, canCreateItems }: { onNavigate: (path: string) => void; canCreateItems: boolean }) {
  const [open, setOpen] = useState(false);
  const preferences = trpc.preferences.get.useQuery(undefined, inventoryQueryOptions);
  const hapticEnabled = preferences.data?.hapticEnabled ?? true;
  const [enabledPaths, setEnabledPaths] = useState<string[]>(() => { if (typeof window === "undefined") return ["/additions", "/disbursements", "/transfers"]; try { const saved = JSON.parse(window.localStorage.getItem("smart-inventory-quick-actions") || "null"); return Array.isArray(saved) && saved.length ? saved : ["/additions", "/disbursements", "/transfers"]; } catch { return ["/additions", "/disbursements", "/transfers"]; } });
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => { if (typeof window === "undefined") return null; try { const saved = JSON.parse(window.localStorage.getItem("smart-inventory-quick-actions-position") || "null"); return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? clampQuickActionsPosition(saved, { width: window.innerWidth, height: window.innerHeight }) : null; } catch { return null; } });
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [compactShape, setCompactShape] = useState<"circle" | "rounded" | "square">(() => { if (typeof window === "undefined") return "circle"; const value = window.localStorage.getItem("smart-inventory-quick-actions-shape"); return value === "rounded" || value === "square" ? value : "circle"; });
  const [compactColor, setCompactColor] = useState<"status" | "teal" | "purple" | "orange">(() => { if (typeof window === "undefined") return "status"; const value = window.localStorage.getItem("smart-inventory-quick-actions-color"); return value === "teal" || value === "purple" || value === "orange" ? value : "status"; });
  const [compactEdge, setCompactEdge] = useState<"right" | "left">(() => typeof window !== "undefined" && window.localStorage.getItem("smart-inventory-quick-actions-edge") === "left" ? "left" : "right");
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  const [isIdle, setIsIdle] = useState(false);
  const [openedFromEdge, setOpenedFromEdge] = useState(false);
  const [actionsMounted, setActionsMounted] = useState(false);
  const [forceCompact, setForceCompact] = useState(false);
  const [collapseNonce, setCollapseNonce] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const wakeIdle = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    if (open) setCollapseNonce(value => value + 1);
    else idleTimerRef.current = window.setTimeout(() => setIsIdle(true), 4500);
  }, [open]);
  useEffect(() => {
    wakeIdle();
    return () => { if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current); };
  }, [wakeIdle]);
  useEffect(() => {
    const keepVisible = () => setPosition(current => {
      if (!current) return current;
      const next = clampQuickActionsPosition(current, { width: window.innerWidth, height: window.innerHeight });
      if (next.x !== current.x || next.y !== current.y) window.localStorage.setItem("smart-inventory-quick-actions-position", JSON.stringify(next));
      return next;
    });
    window.addEventListener("resize", keepVisible);
    window.addEventListener("orientationchange", keepVisible);
    return () => { window.removeEventListener("resize", keepVisible); window.removeEventListener("orientationchange", keepVisible); };
  }, []);
  useEffect(() => { const online = () => setIsOnline(true); const offline = () => setIsOnline(false); const styleSync = () => { const shape = window.localStorage.getItem("smart-inventory-quick-actions-shape"); const color = window.localStorage.getItem("smart-inventory-quick-actions-color"); const edge = window.localStorage.getItem("smart-inventory-quick-actions-edge"); if (shape === "circle" || shape === "rounded" || shape === "square") setCompactShape(shape); if (color === "status" || color === "teal" || color === "purple" || color === "orange") setCompactColor(color); if (edge === "right" || edge === "left") setCompactEdge(edge); }; window.addEventListener("online", online); window.addEventListener("offline", offline); const positionReset = () => setPosition(null); window.addEventListener("smart-inventory-quick-action-style", styleSync); window.addEventListener("smart-inventory-quick-action-position-reset", positionReset); return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.removeEventListener("smart-inventory-quick-action-style", styleSync); window.removeEventListener("smart-inventory-quick-action-position-reset", positionReset); }; }, []);
  useEffect(() => { if (open) { setActionsMounted(true); return; } if (!actionsMounted) return; const timer = window.setTimeout(() => setActionsMounted(false), 300); return () => window.clearTimeout(timer); }, [open, actionsMounted]);
  useEffect(() => { if (!open) return; const timer = window.setTimeout(() => { setForceCompact(true); setOpenedFromEdge(false); setOpen(false); }, 2000); return () => window.clearTimeout(timer); }, [open, collapseNonce]);
  useEffect(() => { if (preferences.data?.quickActions?.length) { setEnabledPaths(preferences.data.quickActions); window.localStorage.setItem("smart-inventory-quick-actions", JSON.stringify(preferences.data.quickActions)); return; } const sync = () => { try { const saved = JSON.parse(window.localStorage.getItem("smart-inventory-quick-actions") || "null"); if (Array.isArray(saved) && saved.length) setEnabledPaths(saved); } catch { /* use current selection */ } }; window.addEventListener("smart-inventory-quick-actions", sync); return () => window.removeEventListener("smart-inventory-quick-actions", sync); }, [preferences.data]);
  const allActions = [{ path: "/items?create=1", label: "إضافة صنف", hint: "فتح نموذج صنف جديد", icon: Package, className: "bg-[#0d4f62] hover:bg-[#0a4150] shadow-[0_12px_28px_rgba(13,79,98,0.28)]" }, { path: "/additions", label: "تسجيل إضافة", hint: "اختصار سطح المكتب: Alt + I", icon: Plus, className: "bg-[#0d806c] hover:bg-[#0a6f5d] shadow-[0_12px_28px_rgba(13,128,108,0.28)]" }, { path: "/disbursements", label: "تسجيل صرف", hint: "اختصار سطح المكتب: Alt + O", icon: ArrowUpFromLine, className: "bg-[#bd5147] hover:bg-[#a9443c] shadow-[0_12px_28px_rgba(189,81,71,0.24)]" }, { path: "/transfers", label: "مرتجع أو تحويل", hint: "إدارة المرتجعات والتحويل بين المخازن", icon: ArrowLeftRight, className: "bg-[#a96821] hover:bg-[#8f571a] shadow-[0_12px_28px_rgba(169,104,33,0.24)]" }];
  const visiblePaths = canCreateItems && !enabledPaths.includes("/items?create=1") ? ["/items?create=1", ...enabledPaths] : enabledPaths;
  const actions = visiblePaths.map(path => allActions.find(action => action.path === path)).filter((action): action is (typeof allActions)[number] => Boolean(action));
  const clampPosition = (x: number, y: number, width: number, height: number) => clampQuickActionsPosition({ x, y }, { width: window.innerWidth, height: window.innerHeight }, Math.max(width, height));
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => { const compact = compactMode; setIsDragging(true); if (!compact) { wakeIdle(); setOpenedFromEdge(false); } const rect = event.currentTarget.getBoundingClientRect(); dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: rect.left, originY: rect.top, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); };
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const dx = event.clientX - drag.startX; const dy = event.clientY - drag.startY; if (!drag.moved && Math.hypot(dx, dy) < 6) return; drag.moved = true; suppressClickRef.current = true; wakeIdle(); setOpenedFromEdge(false); setPosition(clampPosition(drag.originX + dx, drag.originY + dy, event.currentTarget.offsetWidth, event.currentTarget.offsetHeight)); };
  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; dragRef.current = null; setIsDragging(false); if (drag.moved) { wakeIdle(); setForceCompact(true); setOpenedFromEdge(false); const rect = event.currentTarget.getBoundingClientRect(); const next = snapQuickActionsToNearestEdge({ x: rect.left, y: rect.top }, { width: window.innerWidth, height: window.innerHeight }, 48); setCompactEdge(next.edge); setPosition({ x: next.x, y: next.y }); try { window.localStorage.setItem("smart-inventory-quick-actions-position", JSON.stringify({ x: next.x, y: next.y })); window.localStorage.setItem("smart-inventory-quick-actions-edge", next.edge); } catch {} window.setTimeout(() => { suppressClickRef.current = false; }, 0); } else suppressClickRef.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  const compactMode = (isIdle || forceCompact) && !open;
  const edgeMode = openedFromEdge && open;
  const style = edgeMode ? { right: "0px", left: "auto", top: "50%", transform: "translateY(-50%)" } : position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined;
  const compactColorClass = compactColor === "status" ? (isOnline ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700") : compactColor === "purple" ? "bg-violet-600 hover:bg-violet-700" : compactColor === "orange" ? "bg-orange-600 hover:bg-orange-700" : "bg-[#0d4f62] hover:bg-[#0a4150]";
  const compactGlowClass = compactColor === "status" ? (isOnline ? "shadow-[0_0_0_4px_rgba(16,185,129,0.16),0_10px_26px_rgba(16,185,129,0.34)]" : "shadow-[0_0_0_4px_rgba(239,68,68,0.16),0_10px_26px_rgba(239,68,68,0.34)]") : compactColor === "purple" ? "shadow-[0_0_0_4px_rgba(139,92,246,0.16),0_10px_26px_rgba(139,92,246,0.32)]" : compactColor === "orange" ? "shadow-[0_0_0_4px_rgba(249,115,22,0.16),0_10px_26px_rgba(249,115,22,0.32)]" : "shadow-[0_0_0_4px_rgba(13,79,98,0.16),0_10px_26px_rgba(13,79,98,0.32)]";
  const compactShapeClass = compactShape === "circle" ? "rounded-full" : compactShape === "square" ? "rounded-lg" : "rounded-2xl";
  const actionHiddenTransform = compactEdge === "right" ? "translate-x-2" : "-translate-x-2";
  const mobileDockClass = compactMode && !open && position ? `quick-actions-mobile-docked-${compactEdge}` : "";
  return <div className={`fixed z-[55] flex flex-col items-start gap-2 touch-none transition-[left,top,transform,opacity] duration-300 motion-reduce:transition-none ${position && !isDragging ? "quick-actions-settling" : ""} ${mobileDockClass} ${compactMode ? "w-12" : "w-auto"} opacity-100 ${(position && (open || compactMode)) || edgeMode ? "" : "bottom-24 right-4 lg:bottom-6 lg:right-6"}`} style={style} aria-label="إجراءات سريعة" onPointerEnter={() => { if (!compactMode) wakeIdle(); }} onFocus={() => { if (!compactMode) wakeIdle(); }}><div className={`flex flex-col items-start gap-2 overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none ${actionsMounted ? "max-h-56 opacity-100" : "max-h-0 opacity-0"} ${!open ? "pointer-events-none" : ""}`}>{actions.map(({ path, label, hint, icon: Icon, className }, index) => <button key={path} type="button" style={{ transitionDelay: open ? `${index * 45}ms` : `${(actions.length - index - 1) * 45}ms` }} onClick={() => { if (suppressClickRef.current) return; onNavigate(path); setOpen(false); }} title={`${label} — ${hint}`} aria-label={`${label}. ${hint}`} className={`quick-action-item inline-flex items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-black text-white transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${open ? "translate-x-0 opacity-100" : `${actionHiddenTransform} opacity-0`} hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`}><span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/15"><Icon className="h-4 w-4" /></span><span>{label}</span></button>)}</div><button type="button" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onClick={() => { if (suppressClickRef.current) return; const opening = !open; setForceCompact(!opening); setOpenedFromEdge(opening ? (!position && (compactMode || openedFromEdge)) : false); if (!opening) { setCompactEdge("right"); } setIsIdle(false); setOpen(opening); }} title={open ? "إغلاق الإجراءات السريعة" : "فتح الإجراءات السريعة"} aria-label={open ? "إغلاق الإجراءات السريعة" : "فتح الإجراءات السريعة"} aria-expanded={open} className={`quick-actions-fab inline-flex items-center gap-2 rounded-2xl bg-[#0d4f62] text-xs font-black text-white shadow-[0_14px_30px_rgba(13,79,98,0.28)] transition-all duration-200 ease-out transition-shadow hover:-translate-y-0.5 hover:bg-[#0a4150] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d4f62] focus-visible:ring-offset-2 ${compactMode ? `h-12 w-12 justify-center rounded-full p-0 ${compactColorClass} ${compactGlowClass}` : "px-3 py-2.5 bg-[#0d4f62] hover:bg-[#0a4150]"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-xl bg-white/15 transition-transform duration-200 ${open ? "rotate-45" : ""}`}><Plus className="h-4 w-4" /></span>{!compactMode && <span>إجراءات سريعة</span>}</button></div>;
}

function MobileBottomNavigation({ items, activePath, onNavigate, darkMode, visible }: { items: NavigationItem[]; activePath: string; onNavigate: (path: string) => void; darkMode: boolean; visible: boolean }) {
  return <nav className={`fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 rounded-[1.35rem] border p-2 shadow-[0_18px_48px_rgba(13,79,98,0.22)] backdrop-blur-xl transition-transform duration-300 ease-out motion-reduce:transition-none lg:hidden ${visible ? "translate-y-0" : "translate-y-[calc(100%+1rem)]"} ${darkMode ? "border-[#5c9ca4]/20 bg-[#102f3d]/95" : "border-white/80 bg-white/95"}`} dir="rtl" aria-label="التنقل السريع">
    {items.map(item => { const Icon = item.icon; const active = activePath === item.path; return <button key={item.path} type="button" onClick={() => onNavigate(item.path)} className={`group flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] leading-4 font-black transition-all duration-200 ease-out motion-reduce:transition-none active:scale-95 ${active ? "bg-gradient-to-b from-[#0d4f62] to-[#167c87] text-white shadow-md" : darkMode ? "text-[#9bc5ca] hover:bg-white/10 hover:text-white" : "text-[#6b7f89] hover:bg-[#fff4df] hover:text-[#0d4f62]"}`} aria-current={active ? "page" : undefined} title={item.label}><span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 ease-out motion-reduce:transition-none ${active ? "scale-110 bg-[#ffe0a3] shadow-[0_0_0_4px_rgba(255,224,163,0.18)]" : darkMode ? "bg-white/5 group-hover:scale-105" : "bg-[#e8f1f2] group-hover:scale-105"}`}><Icon className={`h-[18px] w-[18px] transition-all duration-200 ease-out motion-reduce:transition-none ${active ? "h-5 w-5 text-[#0d4f62]" : darkMode ? "text-[#8ed3d1]" : "text-[#0d7180]"}`} /></span><span className="max-w-full whitespace-nowrap">{item.mobileLabel ?? item.label}</span></button>; })}
  </nav>;
}

function DashboardLayoutContent({ children, user }: { children: React.ReactNode; user: NonNullable<ReturnType<typeof useAuth>["user"]> }) {
  const [location, setLocation] = useLocation();
  const [previewPermissions, setPreviewPermissions] = useState<PreviewPermissions | null>(() => { try { const raw = window.localStorage.getItem("smart-inventory-preview-permissions"); return raw ? JSON.parse(raw) : null; } catch { return null; } });
  useEffect(() => { const syncPreview = () => { try { const raw = window.localStorage.getItem("smart-inventory-preview-permissions"); setPreviewPermissions(raw ? JSON.parse(raw) : null); } catch { setPreviewPermissions(null); } }; window.addEventListener("smart-inventory-preview", syncPreview); return () => window.removeEventListener("smart-inventory-preview", syncPreview); }, []);
  const [darkMode, setDarkMode] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("smart-inventory-theme") === "dark");
  const [showMobileNavigation, setShowMobileNavigation] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const lastScrollYRef = useRef(0);
  const { state, toggleSidebar } = useSidebar();
  useEffect(() => { document.documentElement.classList.toggle("dark", darkMode); window.localStorage.setItem("smart-inventory-theme", darkMode ? "dark" : "light"); }, [darkMode]);
  useEffect(() => { const applyNumberScale = () => { document.documentElement.dataset.numberScale = window.localStorage.getItem("smart-inventory-number-scale") || "normal"; }; applyNumberScale(); window.addEventListener("smart-inventory-number-scale", applyNumberScale); return () => window.removeEventListener("smart-inventory-number-scale", applyNumberScale); }, []);
  const permissionQuery = trpc.permissions.mine.useQuery(undefined, inventoryQueryOptions);
  const onboardingPreferences = trpc.preferences.get.useQuery(undefined, inventoryQueryOptions);
  const updatePreferences = trpc.preferences.update.useMutation();
  const saveOnboardingCompleted = trpc.preferences.setOnboardingCompleted.useMutation();
  const [restartOnboarding, setRestartOnboarding] = useState(false);
  const [movementFinancialPreferenceVisible, setMovementFinancialPreferenceVisible] = useState(false);
  useEffect(() => { const restart = () => setRestartOnboarding(true); window.addEventListener("smart-inventory-restart-onboarding", restart); return () => window.removeEventListener("smart-inventory-restart-onboarding", restart); }, []);
  const previewUsersQuery = trpc.governance.users.useQuery(undefined, { enabled: Boolean(previewPermissions) });
  const previewPermissionsQuery = trpc.permissions.list.useQuery(undefined, { enabled: Boolean(previewPermissions) });
  const roleReadOnly = ["viewer", "reviewer", "reports"].includes(user.role ?? "");
  const readOnlyRole = previewPermissions?.readOnly ?? permissionQuery.data?.readOnly ?? roleReadOnly;
  const effectivePermissions = previewPermissions ?? permissionQuery.data;
  const isMovementPage = ["/additions", "/disbursements", "/transfers"].some(path => location.startsWith(path));
  const canViewMovementFinancialDetails = effectivePermissions?.allowedReports.includes(MOVEMENT_FINANCIAL_PERMISSION) ?? false;
  const canCreateItems = canCreateInventoryItems(effectivePermissions);
  const showMovementFinancialDetails = canViewMovementFinancialDetails && movementFinancialPreferenceVisible;
  useEffect(() => {
    const saved = onboardingPreferences.data?.reportColumnOrder?.[MOVEMENT_FINANCIAL_PREFERENCE_KEY] ?? [];
    setMovementFinancialPreferenceVisible(canViewMovementFinancialDetails && saved.includes("visible"));
  }, [canViewMovementFinancialDetails, onboardingPreferences.data?.reportColumnOrder]);
  async function toggleMovementFinancialDetails() {
    const next = !movementFinancialPreferenceVisible;
    setMovementFinancialPreferenceVisible(next);
    window.dispatchEvent(new CustomEvent("smart-inventory-movement-financial-details", { detail: next }));
    try {
      await updatePreferences.mutateAsync({ quickActions: onboardingPreferences.data?.quickActions ?? ["/additions", "/disbursements", "/transfers"], hapticEnabled: onboardingPreferences.data?.hapticEnabled ?? true, reportColumnOrder: { ...(onboardingPreferences.data?.reportColumnOrder ?? {}), [MOVEMENT_FINANCIAL_PREFERENCE_KEY]: next ? ["visible"] : [] } });
    } catch (error: any) {
      setMovementFinancialPreferenceVisible(!next);
      window.dispatchEvent(new CustomEvent("smart-inventory-movement-financial-details", { detail: !next }));
      toast.error(error?.message || "تعذر حفظ اختيار التفاصيل المالية");
    }
  }
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; const editingField = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? ""); if (readOnlyRole || editingField || event.ctrlKey || event.metaKey || event.shiftKey || !event.altKey) return; const key = event.key.toLowerCase(); if (key === "i") { event.preventDefault(); setLocation("/additions"); } if (key === "o") { event.preventDefault(); setLocation("/disbursements"); } }; window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readOnlyRole, setLocation]);
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      if (currentScrollY <= 16 || currentScrollY < previousScrollY - 4) setShowMobileNavigation(true);
      else if (currentScrollY > previousScrollY + 4 && currentScrollY > 48) setShowMobileNavigation(false);
      setShowBackToTop(currentScrollY > 360);
      lastScrollYRef.current = currentScrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const isCollapsed = state === "collapsed";
  const warehouses = trpc.warehouses.list.useQuery(undefined, inventoryQueryOptions);
  const isSuppliersDirectory = location === "/suppliers";
  const isCustomersDirectory = location === "/customers";
  const accountMatch = location.match(/^\/(suppliers|customers)\/(\d+)\/statement/);
  const accountKind = accountMatch?.[1] as "suppliers" | "customers" | undefined;
  const accountId = Number(accountMatch?.[2] ?? 0);
  const directorySuppliers = trpc.suppliers.list.useQuery(undefined, { ...inventoryQueryOptions, enabled: isSuppliersDirectory || accountKind === "suppliers" });
  const directoryCustomers = trpc.customers.list.useQuery(undefined, { ...inventoryQueryOptions, enabled: isCustomersDirectory || accountKind === "customers" });
  const supplierAccount = trpc.additions.account.useQuery({ supplierId: accountId }, { ...inventoryQueryOptions, enabled: accountKind === "suppliers" && accountId > 0 });
  const customerAccount = trpc.disbursements.account.useQuery({ customerId: accountId }, { ...inventoryQueryOptions, enabled: accountKind === "customers" && accountId > 0 });
  const offlinePageResource = isSuppliersDirectory ? "دليل الموردين" : isCustomersDirectory ? "دليل العملاء والجهات" : accountKind === "suppliers" ? "كشف حساب المورد" : accountKind === "customers" ? "كشف حساب العميل" : null;
  const offlinePageHasData = isSuppliersDirectory ? directorySuppliers.data !== undefined : isCustomersDirectory ? directoryCustomers.data !== undefined : accountKind === "suppliers" ? directorySuppliers.data !== undefined && supplierAccount.data !== undefined : accountKind === "customers" ? directoryCustomers.data !== undefined && customerAccount.data !== undefined : false;
  const warehouseMenuItems = [{ icon: Warehouse, label: "المخازن", path: "/warehouses" }];
  const governanceItem = buildGovernanceNavigationItems(user.role);
  const allNavigationItems = [
    ...menuItems,
    ...warehouseMenuItems,
    { icon: Truck, label: "الموردون للإضافات", path: "/suppliers" },
    { icon: UserRound, label: "العملاء/جهات الصرف", path: "/customers" },
    ...governanceItem,
  ];
  // The permission model calls the items screen "inventory", while the
  // browser route is /items. Keep both names aligned so the sidebar does not
  // hide the inventory entry for users who already have inventory access.
  const screenForPath = (path: string) => path === "/items" || path.startsWith("/warehouses") ? "inventory" : path.replace(/^\//, "").split("?")[0] || "dashboard";
  const hasScreenPermission = (path: string) => path.startsWith("/governance") || !effectivePermissions || effectivePermissions.allowedScreens.includes(screenForPath(path));
  const navigationItems = allNavigationItems.filter(item => hasScreenPermission(item.path) && (!readOnlyRole || !["/additions", "/disbursements", "/transfers", "/suppliers", "/customers"].includes(item.path)));
  const chatEnabled = hasScreenPermission("/chat");
  const navigationGroups = buildNavigationGroups(navigationItems, governanceItem);
  const activeMenuItem = navigationItems.find(item => isNavigationPathActive(item.path, location)) ?? menuItems[0];
  const mobileNavigationItems = readOnlyRole ? [
    { ...menuItems[0], mobileLabel: "الرئيسية" },
    { ...menuItems[1], mobileLabel: "المخزون" },
    { ...menuItems[8], mobileLabel: "التقارير" },
  ] : [
    { ...menuItems[0], mobileLabel: "الرئيسية" },
    { ...menuItems[1], mobileLabel: "المخزون" },
    { ...menuItems[2], mobileLabel: "الإضافة" },
    { ...menuItems[3], mobileLabel: "الصرف" },
    { ...menuItems[8], mobileLabel: "التقارير" },
  ];
  const { logout } = useAuth();
  const showOnboarding = restartOnboarding || onboardingPreferences.data?.onboardingCompleted === false;
  const completeOnboarding = async () => { try { await saveOnboardingCompleted.mutateAsync({ completed: true }); setRestartOnboarding(false); await onboardingPreferences.refetch(); } catch (error: any) { toast.error(error?.message || "تعذر حفظ إكمال الشرح. حاول مرة أخرى."); } };
  const launchOnboardingFromSettings = async () => { try { await saveOnboardingCompleted.mutateAsync({ completed: false }); setRestartOnboarding(true); await onboardingPreferences.refetch(); toast.success("بدأت الجولة التعريفية من جديد"); } catch (error: any) { toast.error(error?.message || "تعذر بدء الجولة التعريفية"); } };

  return (
    <div className="modern-shell flex min-h-svh w-full min-w-0 flex-1 overflow-x-hidden" dir="rtl">
        <Sidebar side="right" collapsible="icon" className={`${SIDEBAR_VISUAL_CLASSES.surface} border-l border-r-0`}>
          <SidebarHeader className={`${SIDEBAR_VISUAL_CLASSES.header} h-24 justify-center px-4`}>
            <div className="flex items-center gap-3">
              <button onClick={toggleSidebar} className="smart-interactive flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d4f62] to-[#167c87] text-white shadow-lg shadow-[#0d4f62]/20 transition-transform active:scale-95" aria-label="طي القائمة">
                <PanelRight className="h-5 w-5" />
              </button>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-black tracking-[0.28em] text-[#d08a3b]">Smart Inventory</p>
                  <p className="truncate text-sm font-bold text-[#102a43]">مركز المخزون الذكي</p>
                </div>
              )}
            </div>
          </SidebarHeader>
          <SidebarContent className="px-3 py-5">
            <div className={`${SIDEBAR_VISUAL_CLASSES.sectionLabel} mb-3 px-3 text-[10px] font-black tracking-[0.22em] ${isCollapsed ? "sr-only" : ""}`}>مساحات العمل</div>
            <GroupedNavigation groups={navigationGroups} location={location} isCollapsed={isCollapsed} onExpandSidebar={() => { if (isCollapsed) toggleSidebar(); }} onNavigate={setLocation} />
          </SidebarContent>
          <SidebarFooter className={`${SIDEBAR_VISUAL_CLASSES.footer} p-3`}>
            <PwaVersionCard collapsed={isCollapsed} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`${SIDEBAR_VISUAL_CLASSES.profile} flex w-full items-center gap-3 rounded-xl p-2 text-right transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0d4f62]`}>
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
      <SidebarInset className="w-full max-w-full min-w-0 flex-1 bg-transparent">
        <header className="dark-surface sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/70 bg-white/55 px-4 shadow-[0_8px_24px_rgba(18,58,79,0.04)] backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="h-9 w-9 rounded-xl shadow-sm transition-colors hover:bg-[#a8c1b5]" style={{ backgroundColor: "#b7cdc3", color: "#09090b" }} /><Button type="button" variant="ghost" size="icon" onClick={() => setDarkMode(value => !value)} className={`theme-toggle-icon h-9 w-9 rounded-xl shadow-sm transition-colors hover:opacity-90 ${darkMode ? "bg-[#c9d2cd] text-[#1d2929]" : "bg-[#09090b] text-white"}`} aria-label={darkMode ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"} title={darkMode ? "الانتقال إلى الوضع الفاتح" : "الانتقال إلى الوضع الليلي"}><span className="theme-toggle-glyph-wrap" aria-hidden="true">{darkMode ? <Sun key="sun" className="theme-toggle-glyph theme-toggle-sun h-4 w-4" /> : <Moon key="moon" className="theme-toggle-glyph theme-toggle-moon h-4 w-4" />}</span></Button>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d08a3b]" style={{color: '#da0b49'}}>Smart Inventory / إدارة المخزون</p>
              <h1 className="text-lg font-black text-[#102a43]" style={{color: '#036fd3'}}>{activeMenuItem.label}</h1>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            <div className="flex shrink-0 items-center rounded-xl border border-red-200 bg-red-50/80 p-0.5 shadow-sm sm:rounded-2xl sm:p-1" aria-label="البحث الصوتي"><div className="rounded-lg bg-red-50 [&_button]:h-8 [&_button]:w-8 [&_button]:rounded-lg [&_button]:border-red-200 [&_button]:bg-red-50 [&_button]:text-red-600 [&_button]:hover:bg-red-100 sm:rounded-xl sm:[&_button]:h-9 sm:[&_button]:w-9"><GlobalVoiceSearch /></div></div>
            <NotificationBell chatEnabled={chatEnabled} />
            {isMovementPage && canViewMovementFinancialDetails ? <Button type="button" variant="outline" size="sm" onClick={() => void toggleMovementFinancialDetails()} disabled={updatePreferences.isPending || onboardingPreferences.isLoading} aria-pressed={showMovementFinancialDetails} className="movement-financial-toggle inline-flex rounded-xl px-2 text-[10px] font-black sm:px-3 sm:text-xs">{showMovementFinancialDetails ? "إخفاء التفاصيل المالية" : "إظهار التفاصيل المالية"}</Button> : null}
            <div className="hidden rounded-full border border-[#dce7ee] bg-white px-4 py-2 text-xs font-bold text-slate-500 sm:block" style={{color: '#05524d'}}>نظام Smart Inventory • البيانات محفوظة</div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0d4f62] text-xs font-black text-white">{user.name?.charAt(0) ?? "م"}</div>
          </div>
        </header>
        <main key={location} className="page-transition min-h-[calc(100vh-4rem)] w-full min-w-0 overflow-x-hidden px-3 pb-24 pt-4 sm:px-4 md:px-8 md:py-8">{offlinePageResource ? <div className="mb-4"><OfflineDataNotice resource={offlinePageResource} hasCachedData={offlinePageHasData} /></div> : null}{children}</main>
      </SidebarInset>
      {previewPermissions ? <div className="fixed inset-x-3 bottom-4 z-[70] mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/95 px-4 py-3 text-center text-xs font-black text-indigo-900 shadow-xl backdrop-blur"><span>وضع تجربة العرض</span><select value={String(previewPermissions.userId)} className="max-w-[170px] rounded-xl border border-indigo-300 bg-white px-2 py-1.5 text-xs font-black text-indigo-900" onChange={event => { const nextUserId = Number(event.target.value); const selected = (previewUsersQuery.data ?? []).find(item => item.id === nextUserId); const record = (previewPermissionsQuery.data ?? []).find(item => item.userId === nextUserId); if (!selected || !record) { toast.error("احفظ صلاحيات المستخدم أولاً قبل التبديل إليه"); return; } let allowedScreens: string[] = []; let allowedReports: string[] = []; try { allowedScreens = JSON.parse(record.allowedScreens); allowedReports = JSON.parse(record.allowedReports); } catch { toast.error("تعذر قراءة صلاحيات المستخدم"); return; } const nextPreview = { userId: selected.id, userName: selected.name, userEmail: selected.email, allowedScreens, allowedReports, readOnly: record.readOnly }; window.localStorage.setItem("smart-inventory-preview-permissions", JSON.stringify(nextPreview)); setPreviewPermissions(nextPreview); window.dispatchEvent(new Event("smart-inventory-preview")); setLocation("/"); }}>{(previewUsersQuery.data ?? []).map(item => <option key={item.id} value={item.id}>{item.name || item.email || `مستخدم ${item.id}`}</option>)}</select><Button type="button" size="sm" variant="outline" className="rounded-xl border-indigo-300 bg-white text-indigo-900" onClick={() => { window.localStorage.removeItem("smart-inventory-preview-permissions"); window.dispatchEvent(new Event("smart-inventory-preview")); setLocation("/governance"); }}>إنهاء المعاينة والعودة</Button></div> : readOnlyRole && <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-center text-xs font-black text-amber-800 shadow-lg backdrop-blur">حسابك مخصص للمشاهدة فقط — لا يمكنك إضافة أو تعديل أو حذف بيانات المخزون.</div>}
      {showBackToTop && <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="العودة إلى أعلى الصفحة" title="العودة للأعلى" className="back-to-top fixed bottom-24 left-4 z-50 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#8fd7ef] bg-[#e8f8ff] text-[#197da7] shadow-lg transition hover:-translate-y-0.5 md:bottom-8 md:left-8"><ArrowUpFromLine className="h-5 w-5" /></button>}
      {!readOnlyRole && <FloatingQuickActions canCreateItems={canCreateItems} onNavigate={(path) => { setShowMobileNavigation(true); window.scrollTo({ top: 0, behavior: "smooth" }); setLocation(path); }} />}
      {!previewPermissions && chatEnabled && <ChatFloatingBubble />}
      <MobileBottomNavigation items={mobileNavigationItems} activePath={activeMenuItem.path} onNavigate={(path) => { setShowMobileNavigation(true); window.scrollTo({ top: 0, behavior: "smooth" }); setLocation(path); }} darkMode={darkMode} visible={showMobileNavigation} />
      {location.startsWith("/settings") && canAccessMigrationImport(user.role) && <Button type="button" onClick={() => window.location.assign("/migration-import")} className="fixed bottom-40 left-4 z-[52] gap-2 rounded-xl bg-[#0d4f62] text-xs font-black text-white shadow-lg shadow-[#0d4f62]/25 hover:bg-[#0a4150] md:bottom-24 md:left-8"><Upload className="h-4 w-4" />استيراد حزمة الترحيل</Button>}
      {location.startsWith("/settings") && <Button type="button" variant="outline" onClick={() => void launchOnboardingFromSettings()} disabled={saveOnboardingCompleted.isPending} className="fixed bottom-24 left-4 z-[52] gap-2 rounded-xl border-[#8fd1d0] bg-white/95 text-xs font-black text-[#0d4f62] shadow-lg backdrop-blur hover:bg-[#e8f7f6] md:bottom-8 md:left-8"><RotateCcw className="h-4 w-4" />{saveOnboardingCompleted.isPending ? "جارٍ التشغيل..." : "إعادة الجولة التعريفية"}</Button>}
      <OnboardingTour show={showOnboarding} onComplete={completeOnboarding} />
    </div>
  );
}
