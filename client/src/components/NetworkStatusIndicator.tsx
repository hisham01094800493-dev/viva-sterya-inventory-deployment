import { useEffect, useRef, useState } from "react";
import { RefreshCw, Wifi, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getOfflineQueueSummary,
  listOfflineQueue,
  requestOfflineSync,
  subscribeOfflineQueue,
  type OfflineQueueEntry,
} from "@/lib/offlineQueue";
import { getLatestOfflineSnapshotTime } from "@/lib/offlineQueryCache";

function movementLabel(kind: OfflineQueueEntry["kind"]) {
  if (kind === "additions") return "إضافة";
  if (kind === "disbursements") return "صرف";
  return "مرتجع / تحويل";
}

function statusLabel(status: OfflineQueueEntry["status"]) {
  if (status === "syncing") return "جارٍ المزامنة";
  if (status === "failed") return "فشلت المزامنة";
  return "معلقة";
}

export function formatQueueDate(value: number) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NetworkStatusIndicator() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [entries, setEntries] = useState<OfflineQueueEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [latestOfflineSnapshot, setLatestOfflineSnapshot] = useState<number | null>(null);
  const [showFullStatus, setShowFullStatus] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const refreshQueue = () => {
    void Promise.all([getOfflineQueueSummary(), listOfflineQueue(), getLatestOfflineSnapshotTime()]).then(([summary, queue, latestSnapshot]) => {
      setPendingCount(summary.pending);
      setFailedCount(summary.failed);
      setEntries(queue);
      setLatestOfflineSnapshot(latestSnapshot);
    }).catch(() => undefined);
  };

  const revealStatus = () => {
    setShowFullStatus(true);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShowFullStatus(false), 6000);
  };

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); revealStatus(); };
    const handleOffline = () => { setIsOnline(false); revealStatus(); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const unsubscribe = subscribeOfflineQueue(refreshQueue);
    const handleCacheUpdated = () => refreshQueue();
    window.addEventListener("smart-inventory:offline-cache-updated", handleCacheUpdated);
    refreshQueue();
    revealStatus();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
      window.removeEventListener("smart-inventory:offline-cache-updated", handleCacheUpdated);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleSyncNow = () => {
    if (!isOnline) {
      setSyncMessage("لا يمكن بدء المزامنة قبل عودة الإنترنت");
      return;
    }
    if (isSyncing || pendingCount === 0) return;
    setIsSyncing(true);
    setSyncMessage("جارٍ مزامنة العمليات المعلقة...");
    requestOfflineSync();
    const startedAt = Date.now();
    const poll = window.setInterval(() => {
      void getOfflineQueueSummary().then(summary => {
        setPendingCount(summary.pending);
        setFailedCount(summary.failed);
        if (summary.pending === 0 || Date.now() - startedAt > 15000) {
          window.clearInterval(poll);
          setIsSyncing(false);
          setSyncMessage(summary.pending === 0 ? "تمت مزامنة العمليات بنجاح" : "انتهت المحاولة؛ راجع الحالات المتبقية");
          refreshQueue();
        }
      }).catch(() => {
        window.clearInterval(poll);
        setIsSyncing(false);
        setSyncMessage("تعذر قراءة حالة المزامنة");
      });
    }, 500);
  };

  const statusLabelText = `${isOnline ? "متصل بالإنترنت" : "يعمل دون اتصال"}، ${pendingCount} عملية معلقة${failedCount ? `، ${failedCount} فاشلة` : ""}`;

  return (
    <>
      <div className={`network-status-indicator fixed bottom-4 left-4 z-[90] flex items-center gap-1 rounded-full border shadow-lg backdrop-blur-md transition-all duration-300 ${
        isOnline
          ? "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/95 dark:text-emerald-200"
          : "border-amber-200 bg-amber-50/95 text-amber-900 dark:border-amber-900 dark:bg-amber-950/95 dark:text-amber-200"
      }`}>
        {showFullStatus ? (
          <button
            type="button"
            className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            onClick={() => { revealStatus(); refreshQueue(); setOpen(true); }}
            aria-label={statusLabelText}
          >
            {isOnline ? <Wifi className={`network-status-icon h-5 w-5 ${isOnline ? "network-status-online" : "network-status-offline"} ${isSyncing ? "network-status-syncing" : ""}`} aria-hidden="true" /> : <WifiOff className={`network-status-icon h-5 w-5 ${isOnline ? "network-status-online" : "network-status-offline"} ${isSyncing ? "network-status-syncing" : ""}`} aria-hidden="true" />}
            <span>{isOnline ? "متصل بالإنترنت" : "يعمل دون اتصال"}</span>
            <span className="border-r border-current/20 pr-2">{pendingCount ? `${pendingCount} معلقة` : "لا توجد عمليات معلقة"}{failedCount ? ` · ${failedCount} فاشلة` : ""}</span>
            <span className="hidden border-r border-current/20 pr-2 text-[10px] font-medium sm:inline">{latestOfflineSnapshot ? `آخر مزامنة: ${formatQueueDate(latestOfflineSnapshot)}` : "لم تتم مزامنة محلية"}</span>
          </button>
        ) : (
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" onClick={() => { revealStatus(); refreshQueue(); setOpen(true); }} aria-label={`عرض حالة الاتصال: ${statusLabelText}`}>
            {isOnline ? <Wifi className={`network-status-icon h-5 w-5 ${isOnline ? "network-status-online" : "network-status-offline"} ${isSyncing ? "network-status-syncing" : ""}`} aria-hidden="true" /> : <WifiOff className={`network-status-icon h-5 w-5 ${isOnline ? "network-status-online" : "network-status-offline"} ${isSyncing ? "network-status-syncing" : ""}`} aria-hidden="true" />}
          </button>
        )}
        {showFullStatus && <button type="button" onClick={() => { if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current); setShowFullStatus(false); }} className="mr-1 flex h-7 w-7 items-center justify-center rounded-full text-current/60 transition-colors hover:bg-black/5 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" aria-label="إخفاء رسالة حالة الاتصال"><X className="h-3.5 w-3.5" /></button>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل طابور المزامنة</DialogTitle>
            <DialogDescription>
              {isOnline ? "الاتصال متاح ويمكنك بدء المزامنة يدوياً." : "أنت تعمل دون اتصال؛ تعرض القوائم الأساسية آخر نسخة بيانات محفوظة على هذا الجهاز، وستتم مزامنة الحركات المعلقة عند عودة الإنترنت."}
              {latestOfflineSnapshot ? ` آخر حفظ محلي للبيانات: ${formatQueueDate(latestOfflineSnapshot)}` : " لم يتم حفظ نسخة محلية بعد؛ افتح القوائم المطلوبة مرة واحدة أثناء الاتصال ليتم حفظها للاستخدام دون إنترنت."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/50 p-3 text-center"><div className="text-2xl font-bold">{pendingCount}</div><div className="text-xs text-muted-foreground">معلقة</div></div>
            <div className="rounded-xl bg-muted/50 p-3 text-center"><div className="text-2xl font-bold">{failedCount}</div><div className="text-xs text-muted-foreground">فاشلة</div></div>
            <div className="rounded-xl bg-muted/50 p-3 text-center"><div className="text-2xl font-bold">{entries.length}</div><div className="text-xs text-muted-foreground">الإجمالي</div></div>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {entries.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد عمليات معلقة حالياً.</div> : entries.map(entry => <div key={entry.id} className="rounded-xl border bg-card p-3 text-sm shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{movementLabel(entry.kind)}</span><span className={`rounded-full px-2 py-1 text-xs ${entry.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200" : entry.status === "syncing" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>{statusLabel(entry.status)}</span></div><div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2"><span>تاريخ الإنشاء: {formatQueueDate(entry.createdAt)}</span><span>المحاولات: {entry.attempts}</span></div>{entry.lastError && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-200">{entry.lastError}</p>}</div>)}
          </div>
          {syncMessage && <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{syncMessage}</p>}
          <DialogFooter>
            <Button type="button" onClick={handleSyncNow} disabled={!isOnline || isSyncing || pendingCount === 0} loading={isSyncing}>مزامنة الآن</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
