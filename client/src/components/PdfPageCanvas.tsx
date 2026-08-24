import { useEffect, useRef, useState, type PointerEvent, type TouchEvent } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight, Loader2, MoveHorizontal } from "lucide-react";
import { getPdfCanvasSize, getPdfDoubleTapZoom, getPdfFitZoom, getPdfPinchZoom } from "@/lib/pdfPreview";
import { getPdfSwipeDirection, type PdfSwipeDirection } from "@/lib/pdfSwipe";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfPageCanvasProps = {
  url: string;
  pageNumber: number;
  zoom: number;
  onPageCount: (count: number) => void;
  onPageSwipe?: (direction: PdfSwipeDirection) => void;
  onZoomChange?: (zoom: number) => void;
};

export function PdfPageCanvas({ url, pageNumber, zoom, onPageCount, onPageSwipe, onZoomChange }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocumentRef = useRef<{ url: string; task: ReturnType<typeof getDocument>; pdf: Awaited<ReturnType<typeof getDocument>["promise"]> | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [gestureZoom, setGestureZoom] = useState<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const pointerStartRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const lastTapRef = useRef(0);
  const activeZoom = gestureZoom ?? zoom;

  useEffect(() => { setGestureZoom(null); }, [zoom]);

  useEffect(() => () => {
    const cached = pdfDocumentRef.current;
    pdfDocumentRef.current = null;
    if (cached) void cached.task.destroy();
  }, []);

  const changePage = (direction: PdfSwipeDirection) => {
    if (onPageSwipe) { onPageSwipe(direction); return; }
    const dialog = containerRef.current?.closest('[role="dialog"]');
    const label = direction === "next" ? "الصفحة التالية" : "الصفحة السابقة";
    const button = Array.from((dialog ?? document).querySelectorAll<HTMLButtonElement>("button")).find(candidate => candidate.getAttribute("aria-label") === label);
    if (button && !button.disabled) button.click();
  };

  const changeZoom = (nextZoom: number) => {
    if (onZoomChange) onZoomChange(nextZoom);
    else setGestureZoom(nextZoom);
  };

  const toggleDoubleTapZoom = () => changeZoom(getPdfDoubleTapZoom(activeZoom));
  const nudgeHorizontally = (direction: "right" | "left") => {
    containerRef.current?.scrollBy({ left: direction === "right" ? -220 : 220, behavior: "smooth" });
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const [first, second] = [event.touches[0], event.touches[1]];
      pinchRef.current = { distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY), zoom: activeZoom };
      touchStartRef.current = null;
      return;
    }
    if (event.touches.length !== 1) { touchStartRef.current = null; return; }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2) return;
    const [first, second] = [event.touches[0], event.touches[1]];
    const nextDistance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    const nextZoom = getPdfPinchZoom(pinch.zoom, pinch.distance, nextDistance);
    if (nextZoom !== activeZoom) changeZoom(nextZoom);
    event.preventDefault();
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (pinchRef.current) { if (event.touches.length < 2) pinchRef.current = null; return; }
    touchStartRef.current = null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.id !== event.pointerId || event.pointerType !== "touch") return;
    const horizontalDistance = Math.abs(event.clientX - start.x);
    if (activeZoom > 1 && horizontalDistance > 18) return;
    const direction = getPdfSwipeDirection(start, { x: event.clientX, y: event.clientY });
    if (direction) { changePage(direction); return; }
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18) return;
    const elapsed = event.timeStamp - lastTapRef.current;
    if (elapsed > 0 && elapsed < 340) { lastTapRef.current = 0; toggleDoubleTapZoom(); }
    else lastTapRef.current = event.timeStamp;
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateWidth = () => setAvailableWidth(Math.max(0, element.clientWidth - 24));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let cached = pdfDocumentRef.current;
    if (!cached || cached.url !== url) {
      if (cached) void cached.task.destroy();
      cached = { url, task: getDocument({ url }), pdf: null };
      pdfDocumentRef.current = cached;
    }
    setLoading(true);
    setError(null);

    const loadPdf = cached.pdf ? Promise.resolve(cached.pdf) : cached.task.promise.then(pdf => { cached!.pdf = pdf; return pdf; });
    void loadPdf.then(async pdf => {
      if (!active) return;
      onPageCount(pdf.numPages);
      const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
      const viewport = page.getViewport({ scale: 1.2 });
      const renderZoom = getPdfFitZoom(viewport.width, availableWidth, activeZoom);
      const size = getPdfCanvasSize(viewport.width, viewport.height, renderZoom, Math.min(2, window.devicePixelRatio || 1));
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { alpha: false });
      if (!active || !canvas || !context) return;
      canvas.width = size.pixelWidth;
      canvas.height = size.pixelHeight;
      canvas.style.width = `${size.cssWidth}px`;
      canvas.style.height = `${size.cssHeight}px`;
      renderTask = page.render({ canvas, canvasContext: context, viewport, transform: [size.pixelRatio * renderZoom, 0, 0, size.pixelRatio * renderZoom, 0, 0] });
      await renderTask.promise;
      if (active) setLoading(false);
    }).catch(() => {
      if (active) { setError("تعذر عرض صفحة PDF داخل التطبيق."); setLoading(false); }
    });

    return () => { active = false; renderTask?.cancel(); };
  }, [url, pageNumber, activeZoom, onPageCount, availableWidth]);

  return <div ref={containerRef} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onDoubleClick={event => { event.preventDefault(); toggleDoubleTapZoom(); }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} className={`pdf-page-canvas-host relative flex min-h-full w-full items-start ${activeZoom > 1 ? "justify-start" : "justify-center"} p-3`} dir="ltr">
    {loading && <div className="absolute mt-12 flex items-center gap-2 rounded-xl bg-white/95 px-4 py-3 text-sm font-bold text-slate-500 shadow"><Loader2 className="h-4 w-4 animate-spin" />جارٍ رسم صفحة التقرير…</div>}
    {activeZoom > 1 && <button type="button" onClick={() => { if (onZoomChange) onZoomChange(1); else setGestureZoom(1); }} className="absolute left-4 top-4 z-10 rounded-lg border border-[#b9d4d9] bg-white/95 px-3 py-1.5 text-xs font-bold text-[#0d4f62] shadow-sm">ملاءمة العرض</button>}
    {error ? <div className="mt-12 rounded-xl bg-white px-5 py-4 text-center text-sm font-bold text-red-600 shadow">{error}</div> : <canvas ref={canvasRef} className={`pdf-reading-canvas bg-white shadow-sm ${activeZoom > 1 ? "pdf-reading-canvas--zoomed" : ""}`} aria-label={`صفحة PDF رقم ${pageNumber}`} />}
    {activeZoom > 1 ? <div className="pdf-horizontal-scroll-hint" dir="rtl"><button type="button" onClick={() => nudgeHorizontally("right")} aria-label="تحريك المعاينة نحو اليمين"><ChevronRight className="h-4 w-4" /></button><span><MoveHorizontal className="h-3.5 w-3.5" />اسحب أفقيًا أو استخدم الشريط</span><button type="button" onClick={() => nudgeHorizontally("left")} aria-label="تحريك المعاينة نحو اليسار"><ChevronLeft className="h-4 w-4" /></button></div> : null}
  </div>;
}
