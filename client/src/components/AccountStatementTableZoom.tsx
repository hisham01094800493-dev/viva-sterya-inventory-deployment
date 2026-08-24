import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

export const accountStatementTableZoomLimits = { min: 0.5, max: 1.6, step: 0.1 } as const;

export function clampAccountStatementTableZoom(value: number) {
  return Math.min(accountStatementTableZoomLimits.max, Math.max(accountStatementTableZoomLimits.min, Number(value.toFixed(2))));
}

export function getAccountStatementTablePinchZoom(startZoom: number, startDistance: number, nextDistance: number) {
  return startDistance > 0 && nextDistance > 0 ? clampAccountStatementTableZoom(startZoom * (nextDistance / startDistance)) : clampAccountStatementTableZoom(startZoom);
}

type Attachment = {
  table: HTMLTableElement;
  scroller: HTMLElement;
  host: HTMLDivElement;
  root: Root;
  previousZoom: string;
  previousTouchAction: string;
  onTouchStart: (event: TouchEvent) => void;
  onTouchMove: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
};

const tableSelector = 'table[data-account-statement-table="true"]';

export default function AccountStatementTableZoom() {
  const [zoom, setZoom] = useState(1);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    const attachments = new Map<HTMLTableElement, Attachment>();
    const distance = (touches: TouchList) => touches.length >= 2 ? Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY) : 0;
    const detach = (attachment: Attachment) => {
      attachment.table.style.zoom = attachment.previousZoom;
      attachment.scroller.classList.remove("account-statement-table-scroller");
      attachment.scroller.style.touchAction = attachment.previousTouchAction;
      attachment.scroller.removeEventListener("touchstart", attachment.onTouchStart);
      attachment.scroller.removeEventListener("touchmove", attachment.onTouchMove);
      attachment.scroller.removeEventListener("touchend", attachment.onTouchEnd);
      attachment.scroller.removeEventListener("touchcancel", attachment.onTouchEnd);
      attachment.root.unmount();
      attachment.host.remove();
      attachments.delete(attachment.table);
    };
    const attach = () => {
      for (const attachment of Array.from(attachments.values())) {
        if (!attachment.table.isConnected || !attachment.table.matches(tableSelector)) detach(attachment);
      }
      document.querySelectorAll<HTMLTableElement>(tableSelector).forEach(table => {
        if (attachments.has(table)) return;
        const scroller = table.closest<HTMLElement>(".overflow-x-auto");
        const hostParent = scroller?.parentElement;
        if (!scroller || !hostParent) return;
        const previousZoom = table.style.zoom;
        const previousTouchAction = scroller.style.touchAction;
        table.style.zoom = zoom === 1 ? previousZoom : String(zoom);
        scroller.classList.add("account-statement-table-scroller");
        scroller.style.touchAction = "pan-x pan-y";
        const onTouchStart = (event: TouchEvent) => {
          const startDistance = distance(event.touches);
          if (startDistance) pinchRef.current = { distance: startDistance, zoom };
        };
        const onTouchMove = (event: TouchEvent) => {
          const pinch = pinchRef.current;
          const nextDistance = distance(event.touches);
          if (!pinch || !nextDistance) return;
          event.preventDefault();
          setZoom(getAccountStatementTablePinchZoom(pinch.zoom, pinch.distance, nextDistance));
        };
        const onTouchEnd = (event: TouchEvent) => {
          if (event.touches.length < 2) pinchRef.current = null;
        };
        scroller.addEventListener("touchstart", onTouchStart, { passive: false });
        scroller.addEventListener("touchmove", onTouchMove, { passive: false });
        scroller.addEventListener("touchend", onTouchEnd, { passive: true });
        scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
        const host = document.createElement("div");
        host.dataset.accountStatementTableZoom = "true";
        hostParent.appendChild(host);
        const root = createRoot(host);
        const setClampedZoom = (next: number) => setZoom(clampAccountStatementTableZoom(next));
        root.render(<div role="group" aria-label="أدوات تكبير جدول كشف الحساب" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f5] bg-[#fbfdff] px-5 py-3" dir="rtl"><p className="text-xs font-bold text-slate-500">استخدم إصبعين للتكبير والتصغير داخل الجدول</p><div className="flex items-center gap-2"><button type="button" onClick={() => setClampedZoom(zoom - accountStatementTableZoomLimits.step)} disabled={zoom <= accountStatementTableZoomLimits.min} aria-label="تصغير جدول كشف الحساب" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#b9d4d9] bg-white text-[#0d4f62] hover:bg-[#eef7f7] disabled:cursor-not-allowed disabled:opacity-40"><ZoomOut className="h-4 w-4" /></button><span aria-live="polite" className="min-w-14 text-center text-xs font-black text-[#0d4f62]">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setClampedZoom(zoom + accountStatementTableZoomLimits.step)} disabled={zoom >= accountStatementTableZoomLimits.max} aria-label="تكبير جدول كشف الحساب" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#0d7180] bg-white text-[#0d7180] hover:bg-[#eef7f7] disabled:cursor-not-allowed disabled:opacity-40"><ZoomIn className="h-4 w-4" /></button><button type="button" onClick={() => setZoom(1)} disabled={zoom === 1} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#b9d4d9] bg-white px-3 text-xs font-black text-[#0d4f62] hover:bg-[#eef7f7] disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />إعادة</button></div></div>);
        attachments.set(table, { table, scroller, host, root, previousZoom, previousTouchAction, onTouchStart, onTouchMove, onTouchEnd });
        window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent<HTMLTableElement>("smart-table-refresh", { detail: table })));
      });
    };
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    attach();
    return () => {
      observer.disconnect();
      Array.from(attachments.values()).forEach(detach);
    };
  }, [zoom]);

  return null;
}
