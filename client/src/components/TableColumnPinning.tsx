import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

type PinningPreferences = {
  quickActions: string[];
  hapticEnabled: boolean;
  reportColumnOrder: Record<string, string[]>;
};

export function getNextSmartPinnedColumns(current: number[], selected: number) {
  return current.includes(selected) ? current.filter(column => column !== selected) : [...current, selected].slice(-2);
}

export function getSmartPinnedColumnOffsets(pinnedColumns: number[], widths: number[]) {
  const ordered = [...pinnedColumns].sort((left, right) => left - right);
  let offset = 0;
  return ordered.map(column => {
    const current = { column, offset };
    offset += Math.max(0, widths[column] ?? 0);
    return current;
  });
}

export function getSmartPinnedColumnLayout(pinnedColumns: number[], widths: number[], viewportWidth: number) {
  const ordered = [...pinnedColumns].sort((left, right) => left - right);
  const totalWidth = ordered.reduce((sum, column) => sum + Math.max(0, widths[column] ?? 0), 0);
  const scale = totalWidth > 0 && viewportWidth > 0 ? Math.min(1, viewportWidth / totalWidth) : 1;
  let offset = 0;
  return ordered.map(column => {
    const width = Math.max(0, (widths[column] ?? 0) * scale);
    const current = { column, offset, width };
    offset += width;
    return current;
  });
}

export function clampSmartTableZoom(value: number) {
  return Math.min(1.6, Math.max(0.5, Number(value.toFixed(2))));
}

export function getSmartTablePinchZoom(currentZoom: number, startDistance: number, nextDistance: number) {
  return clampSmartTableZoom(currentZoom * nextDistance / Math.max(1, startDistance));
}

function getTablePreferenceKey(table: HTMLTableElement, index: number) {
  const currentPath = window.location.pathname.replace(/[^a-z0-9-]/gi, "-").slice(-28) || "dashboard";
  const explicitId = table.dataset.tablePinningId ?? (table.dataset.accountStatementTable === "true" ? "account-statement" : undefined);
  return `table-pins:${currentPath}:${explicitId ?? index}`;
}

function parsePinnedColumns(saved: string[] | undefined, headerCount: number) {
  return (saved ?? []).map(value => Number(value)).filter(column => Number.isInteger(column) && column >= 0 && column < headerCount).slice(-2);
}

function attachInventoryTableZoom(table: HTMLTableElement, scroller: HTMLElement) {
  if (!table.classList.contains("inventory-items-table")) return () => undefined;
  const previousZoom = table.style.zoom;
  const previousTouchAction = scroller.style.touchAction;
  let zoom = clampSmartTableZoom(Number.parseFloat(getComputedStyle(table).zoom) || 1);
  const controls = document.createElement("div");
  controls.className = "smart-table-zoom-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "أدوات تكبير جدول الأصناف والمخزون");
  const zoomOut = document.createElement("button");
  zoomOut.type = "button";
  zoomOut.textContent = "−";
  zoomOut.title = "تصغير جدول الأصناف";
  zoomOut.setAttribute("aria-label", "تصغير جدول الأصناف");
  const percentage = document.createElement("span");
  percentage.setAttribute("aria-live", "polite");
  const zoomIn = document.createElement("button");
  zoomIn.type = "button";
  zoomIn.textContent = "+";
  zoomIn.title = "تكبير جدول الأصناف";
  zoomIn.setAttribute("aria-label", "تكبير جدول الأصناف");
  controls.append(zoomOut, percentage, zoomIn);
  scroller.insertAdjacentElement("beforebegin", controls);
  const applyZoom = (next: number) => {
    zoom = clampSmartTableZoom(next);
    table.style.zoom = String(zoom);
    percentage.textContent = `${Math.round(zoom * 100)}%`;
    window.dispatchEvent(new Event("resize"));
  };
  applyZoom(zoom);
  const onZoomOut = () => applyZoom(zoom - 0.1);
  const onZoomIn = () => applyZoom(zoom + 0.1);
  const distance = (touches: TouchList) => touches.length >= 2 ? Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY) : 0;
  let pinch: { distance: number; zoom: number } | null = null;
  const onTouchStart = (event: TouchEvent) => { const startDistance = distance(event.touches); if (startDistance) pinch = { distance: startDistance, zoom }; };
  const onTouchMove = (event: TouchEvent) => { const nextDistance = distance(event.touches); if (!pinch || !nextDistance) return; if (event.cancelable) event.preventDefault(); applyZoom(getSmartTablePinchZoom(pinch.zoom, pinch.distance, nextDistance)); };
  const onTouchEnd = (event: TouchEvent) => { if (event.touches.length < 2) pinch = null; };
  zoomOut.addEventListener("click", onZoomOut);
  zoomIn.addEventListener("click", onZoomIn);
  scroller.style.touchAction = "pan-x pan-y";
  scroller.addEventListener("touchstart", onTouchStart, { passive: true });
  scroller.addEventListener("touchmove", onTouchMove, { passive: false });
  scroller.addEventListener("touchend", onTouchEnd, { passive: true });
  scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
  return () => {
    table.style.zoom = previousZoom;
    scroller.style.touchAction = previousTouchAction;
    zoomOut.removeEventListener("click", onZoomOut);
    zoomIn.removeEventListener("click", onZoomIn);
    scroller.removeEventListener("touchstart", onTouchStart);
    scroller.removeEventListener("touchmove", onTouchMove);
    scroller.removeEventListener("touchend", onTouchEnd);
    scroller.removeEventListener("touchcancel", onTouchEnd);
    controls.remove();
  };
}

function attachColumnPinning(table: HTMLTableElement, preferenceKey: string, savedColumns: string[] | undefined, persist: (key: string, columns: number[]) => void) {
  const scroller = table.closest<HTMLElement>(".overflow-x-auto") ?? table.parentElement;
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  if (!scroller || headers.length < 2) return () => undefined;

  const previousOverflowX = scroller.style.overflowX;
  const previousOverflowY = scroller.style.overflowY;
  const previousMaxBlockSize = scroller.style.maxBlockSize;
  const previousScrollbarGutter = scroller.style.scrollbarGutter;
  scroller.classList.add("smart-table-scroll-region");
  scroller.dataset.smartTableScroller = "true";
  scroller.style.overflowX = "auto";
  scroller.style.overflowY = "auto";
  scroller.style.maxBlockSize = "min(62dvh, 34rem)";
  scroller.style.scrollbarGutter = "stable both-edges";
  const detachInventoryZoom = attachInventoryTableZoom(table, scroller);
  let pinnedColumns = parsePinnedColumns(savedColumns, headers.length);
  const clearPinnedCells = () => {
    Array.from(table.rows).forEach(row => Array.from(row.cells).forEach(cell => {
      cell.classList.remove("smart-table-pinned");
      delete cell.dataset.pinRank;
      cell.style.removeProperty("--smart-pinned-column-offset");
      cell.style.removeProperty("--smart-pinned-column-width");
      cell.style.removeProperty("inset-inline-start");
      cell.style.removeProperty("inline-size");
      if (!cell.closest("thead")) {
        cell.style.removeProperty("position");
        cell.style.removeProperty("z-index");
      }
    }));
  };
  const applyStickyHeaders = () => {
    if (table.tHead) {
      table.tHead.style.setProperty("position", "sticky", "important");
      table.tHead.style.setProperty("inset-block-start", "0px", "important");
      table.tHead.style.setProperty("top", "0px", "important");
      table.tHead.style.setProperty("z-index", "40", "important");
    }
    headers.forEach(header => {
      header.style.setProperty("position", "sticky", "important");
      header.style.setProperty("inset-block-start", "0px", "important");
      header.style.setProperty("top", "0px", "important");
      header.style.setProperty("z-index", "41", "important");
    });
  };
  const clearStickyHeaders = () => {
    if (table.tHead) {
      table.tHead.style.removeProperty("position");
      table.tHead.style.removeProperty("inset-block-start");
      table.tHead.style.removeProperty("top");
      table.tHead.style.removeProperty("z-index");
    }
    headers.forEach(header => {
      header.style.removeProperty("position");
      header.style.removeProperty("inset-block-start");
      header.style.removeProperty("top");
      header.style.removeProperty("z-index");
    });
  };
  const applyPinnedColumns = () => {
    clearPinnedCells();
    applyStickyHeaders();
    const tableZoom = Number.parseFloat(getComputedStyle(table).zoom) || 1;
    const headerWidths = headers.map(header => header.getBoundingClientRect().width / tableZoom);
    const pinnedViewportWidth = Math.max(0, scroller.getBoundingClientRect().width / tableZoom - 2);
    const layout = new Map(getSmartPinnedColumnLayout(pinnedColumns, headerWidths, pinnedViewportWidth).map(item => [item.column, item]));
    const ordered = [...pinnedColumns].sort((left, right) => left - right);
    headers.forEach((header, index) => {
      const isPinned = ordered.includes(index);
      header.classList.add("smart-table-pin-trigger");
      header.tabIndex = 0;
      header.setAttribute("role", "button");
      header.setAttribute("aria-pressed", String(isPinned));
      header.setAttribute("aria-label", `${isPinned ? "إلغاء تثبيت" : "تثبيت"} عمود ${header.textContent?.trim() || index + 1}`);
      header.title = isPinned ? "إلغاء تثبيت هذا العمود" : "تثبيت العمود أثناء التمرير الأفقي — حد أقصى عمودان";
    });
    Array.from(table.rows).forEach(row => ordered.forEach((column, rank) => {
      const cell = row.cells[column];
      if (!cell) return;
      cell.classList.add("smart-table-pinned");
      cell.dataset.pinRank = String(rank + 1);
      cell.style.setProperty("--smart-pinned-column-offset", `${layout.get(column)?.offset ?? 0}px`);
      cell.style.setProperty("position", "sticky", "important");
      cell.style.setProperty("inset-inline-start", `${layout.get(column)?.offset ?? 0}px`, "important");
      cell.style.setProperty("z-index", cell.closest("thead") ? String(60 - rank) : String(20 - rank), "important");
      const constrainedWidth = layout.get(column)?.width ?? 0;
      if (constrainedWidth + 0.5 < (headerWidths[column] ?? 0)) {
        cell.style.setProperty("--smart-pinned-column-width", `${constrainedWidth}px`);
        cell.style.setProperty("inline-size", `${constrainedWidth}px`, "important");
      } else cell.style.removeProperty("--smart-pinned-column-width");
    }));
  };
  const toggleColumn = (selected: number) => {
    pinnedColumns = getNextSmartPinnedColumns(pinnedColumns, selected);
    persist(preferenceKey, pinnedColumns);
    applyPinnedColumns();
  };
  const onHeaderClick = (event: MouseEvent) => {
    const header = event.currentTarget as HTMLTableCellElement;
    if ((event.target as HTMLElement).closest("button,a,input,select,label")) return;
    const index = headers.indexOf(header);
    if (index >= 0) toggleColumn(index);
  };
  const onHeaderKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const index = headers.indexOf(event.currentTarget as HTMLTableCellElement);
    if (index >= 0) toggleColumn(index);
  };
  headers.forEach(header => {
    header.addEventListener("click", onHeaderClick);
    header.addEventListener("keydown", onHeaderKeyDown);
  });
  applyPinnedColumns();
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
    applyPinnedColumns();
  });
  resizeObserver?.observe(table);
  resizeObserver?.observe(scroller);
  headers.forEach(header => resizeObserver?.observe(header));
  return () => {
    resizeObserver?.disconnect();
    detachInventoryZoom();
    clearPinnedCells();
    clearStickyHeaders();
    scroller.classList.remove("smart-table-scroll-region");
    delete scroller.dataset.smartTableScroller;
    scroller.style.overflowX = previousOverflowX;
    scroller.style.overflowY = previousOverflowY;
    scroller.style.maxBlockSize = previousMaxBlockSize;
    scroller.style.scrollbarGutter = previousScrollbarGutter;
    headers.forEach(header => {
      header.classList.remove("smart-table-pin-trigger");
      header.removeAttribute("tabindex");
      header.removeAttribute("role");
      header.removeAttribute("aria-pressed");
      header.removeAttribute("aria-label");
      header.removeAttribute("title");
      header.removeEventListener("click", onHeaderClick);
      header.removeEventListener("keydown", onHeaderKeyDown);
    });
  };
}

export default function TableColumnPinning() {
  const preferences = trpc.preferences.get.useQuery();
  const updatePreferences = trpc.preferences.update.useMutation();
  const preferenceRef = useRef<PinningPreferences | null>(null);

  useEffect(() => {
    if (preferences.data) preferenceRef.current = preferences.data;
  }, [preferences.data]);

  useEffect(() => {
    const cleanups = new Map<HTMLTableElement, () => void>();
    const persist = (key: string, columns: number[]) => {
      const current = preferenceRef.current;
      if (!current) return;
      const reportColumnOrder = { ...current.reportColumnOrder, [key]: columns.map(String) };
      preferenceRef.current = { ...current, reportColumnOrder };
      updatePreferences.mutate({ quickActions: current.quickActions, hapticEnabled: current.hapticEnabled, reportColumnOrder });
    };
    const sync = () => {
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));
      tables.forEach((table, index) => {
        if (cleanups.has(table)) return;
        const preferenceKey = getTablePreferenceKey(table, index);
        cleanups.set(table, attachColumnPinning(table, preferenceKey, preferenceRef.current?.reportColumnOrder?.[preferenceKey], persist));
      });
      Array.from(cleanups.entries()).forEach(([table, cleanup]) => {
        if (!table.isConnected || !tables.includes(table)) {
          cleanup();
          cleanups.delete(table);
        }
      });
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const refreshTable = (event: Event) => {
      const table = (event as CustomEvent<HTMLTableElement>).detail;
      const cleanup = table ? cleanups.get(table) : undefined;
      if (cleanup && table) {
        cleanup();
        cleanups.delete(table);
      }
      sync();
    };
    window.addEventListener("smart-table-refresh", refreshTable);
    sync();
    return () => {
      observer.disconnect();
      window.removeEventListener("smart-table-refresh", refreshTable);
      cleanups.forEach(cleanup => cleanup());
      cleanups.clear();
    };
  }, [preferences.data?.reportColumnOrder, updatePreferences]);

  return null;
}
