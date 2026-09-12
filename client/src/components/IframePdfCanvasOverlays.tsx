import { createRoot, type Root } from "react-dom/client";
import { useEffect, useState } from "react";
import { Download, Eye, ZoomIn, ZoomOut } from "lucide-react";
import { PdfPageCanvas } from "@/components/PdfPageCanvas";

type MountedOverlay = { root: Root; host: HTMLDivElement; parent: HTMLElement };

function IframePdfCanvasOverlay({ url }: { url: string }) {
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [zoom, setZoom] = useState(1);
  const download = () => { const link = document.createElement("a"); link.href = url; link.download = "smart-inventory-report.pdf"; link.click(); };
  const external = () => { window.open(`${url}#page=${page}`, "_blank", "noopener,noreferrer"); };

  return <div className="flex h-full min-h-[48vh] flex-col bg-slate-100" dir="rtl"><div className="flex flex-wrap items-center justify-center gap-2 border-b border-[#dce7ee] bg-white px-3 py-2"><button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} aria-label="الصفحة السابقة" className="rounded-lg border border-[#b9d4d9] px-3 py-1.5 text-xs font-bold text-[#0d4f62] disabled:opacity-40">السابقة</button><span className="min-w-24 text-center text-xs font-black text-[#0d4f62]">صفحة {page} من {pageCount}</span><button type="button" onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page >= pageCount} aria-label="الصفحة التالية" className="rounded-lg border border-[#b9d4d9] px-3 py-1.5 text-xs font-bold text-[#0d4f62] disabled:opacity-40">التالية</button><span className="mx-1 h-5 w-px bg-[#dce7ee]" /><button type="button" onClick={() => setZoom(value => Math.max(0.75, Number((value - 0.1).toFixed(2))))} disabled={zoom <= 0.75} aria-label="تصغير PDF" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#b9d4d9] text-[#0d4f62] disabled:opacity-40"><ZoomOut className="h-4 w-4" /></button><span className="min-w-12 text-center text-xs font-black text-[#0d4f62]">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(value => Math.min(1.75, Number((value + 0.1).toFixed(2))))} disabled={zoom >= 1.75} aria-label="تكبير PDF" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#b9d4d9] text-[#0d4f62] disabled:opacity-40"><ZoomIn className="h-4 w-4" /></button><button type="button" onClick={external} title="معاينة خارجية" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#b9d4d9] text-[#0d4f62]"><Eye className="h-4 w-4" /></button><button type="button" onClick={download} title="تنزيل PDF" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d806c] text-[#0d806c]"><Download className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-auto"><PdfPageCanvas url={url} pageNumber={page} zoom={zoom} onPageCount={count => { setPageCount(count); setPage(value => Math.min(value, count)); }} /></div></div>;
}

export default function IframePdfCanvasOverlays() {
  useEffect(() => {
    const mounted = new Map<HTMLIFrameElement, MountedOverlay>();
    const scan = () => {
      // Desktop Chromium's native PDF renderer handles embedded Arabic fonts
      // correctly. The PDF.js canvas overlay can substitute a fallback font
      // on desktop and turn Arabic text into unreadable Latin glyphs, while
      // the mobile layout benefits from the custom paging/zoom controls.
      if (!window.matchMedia("(max-width: 767px)").matches) {
        Array.from(mounted.values()).forEach(overlay => { overlay.root.unmount(); overlay.host.remove(); overlay.parent.classList.remove("relative"); });
        mounted.clear();
        return;
      }
      const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[title*="PDF"]')).filter(frame => frame.title !== "معاينة نتائج البحث PDF" && Boolean(frame.src));
      for (const frame of frames) {
        if (mounted.has(frame) || !frame.parentElement) continue;
        const parent = frame.parentElement as HTMLElement;
        parent.classList.add("relative");
        const host = document.createElement("div");
        host.className = "absolute inset-0 z-20 h-full w-full bg-slate-100";
        parent.appendChild(host);
        const root = createRoot(host);
        root.render(<IframePdfCanvasOverlay url={frame.src} />);
        mounted.set(frame, { root, host, parent });
      }
      for (const [frame, overlay] of Array.from(mounted.entries())) {
        if (frame.isConnected && frames.includes(frame)) continue;
        overlay.root.unmount();
        overlay.host.remove();
        overlay.parent.classList.remove("relative");
        mounted.delete(frame);
      }
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    const media = window.matchMedia("(max-width: 767px)");
    media.addEventListener("change", scan);
    return () => { observer.disconnect(); media.removeEventListener("change", scan); Array.from(mounted.values()).forEach(overlay => { overlay.root.unmount(); overlay.host.remove(); overlay.parent.classList.remove("relative"); }); };
  }, []);
  return null;
}
