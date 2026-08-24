import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeMovementPageInput, normalizeMovementPageTotals } from "./db";
import { clampMovementTableZoom, getMovementTablePinchZoom, getMovementTotalsScopeLabel, getNextPinnedMovementColumn, getNextPinnedMovementColumns, getPinnedMovementColumnOffsets, shouldShowMovementPageSkeleton } from "../client/src/pages/InventoryPages";
import { clampAccountStatementTableZoom, getAccountStatementTablePinchZoom } from "../client/src/components/AccountStatementTableZoom";
import { clampSmartTableZoom, getNextSmartPinnedColumns, getSmartPinnedColumnOffsets, getSmartPinnedColumnLayout, getSmartTablePinchZoom } from "../client/src/components/TableColumnPinning";

describe("حسابات ترقيم الحركات", () => {
  it("يستخدم الصفحة الأولى و50 سجلًا افتراضيًا", () => {
    expect(normalizeMovementPageInput({})).toEqual({ page: 1, pageSize: 50 });
  });

  it("يمنع أرقام الصفحات والأحجام غير الآمنة", () => {
    expect(normalizeMovementPageInput({ page: 0, pageSize: 1 })).toEqual({ page: 1, pageSize: 10 });
    expect(normalizeMovementPageInput({ page: 3.9, pageSize: 1000 })).toEqual({ page: 3, pageSize: 100 });
  });

  it("يعرض هيكل التحميل أثناء جلب صفحة حركات جديدة", () => {
    expect(shouldShowMovementPageSkeleton(true)).toBe(true);
    expect(shouldShowMovementPageSkeleton(false)).toBe(false);
  });

  it("يضبط تكبير الجدول ضمن الحدود من اللمس والأزرار", () => {
    expect(clampMovementTableZoom(0.2)).toBe(0.5);
    expect(clampMovementTableZoom(2)).toBe(1.6);
    expect(getMovementTablePinchZoom(1, 100, 130)).toBe(1.3);
    expect(getMovementTablePinchZoom(1.5, 100, 150)).toBe(1.6);
  });

  it("يوحّد حدود التكبير وإيماءة الإصبعين في كشف الحساب مع جدول الحركات", () => {
    expect(clampAccountStatementTableZoom(0.2)).toBe(0.5);
    expect(clampAccountStatementTableZoom(2)).toBe(1.6);
    expect(getAccountStatementTablePinchZoom(1, 100, 130)).toBe(1.3);
    expect(getAccountStatementTablePinchZoom(1.5, 100, 150)).toBe(1.6);
  });

  it("يتيح لجدول الأصناف تكبيرًا آمنًا بأزرار وإيماءة إصبعين", () => {
    expect(clampSmartTableZoom(0.2)).toBe(0.5);
    expect(clampSmartTableZoom(2)).toBe(1.6);
    expect(getSmartTablePinchZoom(1, 100, 130)).toBe(1.3);
    expect(getSmartTablePinchZoom(1.5, 100, 150)).toBe(1.6);
  });

  it("يربط أدوات التكبير بجدول كشف الحساب دون التأثير في جدول البيانات أو التصدير", () => {
    const statementPage = readFileSync(resolve(process.cwd(), "client/src/pages/WarehousesSuppliersPages.tsx"), "utf8");
    const statementZoom = readFileSync(resolve(process.cwd(), "client/src/components/AccountStatementTableZoom.tsx"), "utf8");
    const tablePinning = readFileSync(resolve(process.cwd(), "client/src/components/TableColumnPinning.tsx"), "utf8");
    expect(statementPage).toContain('data-account-statement-table="true"');
    expect(statementPage).toContain("account-statement-scroll-region");
    expect(statementPage).toContain('dir="rtl"');
    expect(statementPage).toContain("min-w-[780px]");
    expect(statementZoom).toContain("أدوات تكبير جدول كشف الحساب");
    expect(statementZoom).toContain("استخدم إصبعين للتكبير والتصغير داخل الجدول");
    expect(statementZoom).toContain("account-statement-table-scroller");
    expect(tablePinning).toContain('table.dataset.accountStatementTable === "true" ? "account-statement"');
    expect(tablePinning).toContain("smart-table-scroll-region");
    expect(tablePinning).toContain('table.classList.contains("inventory-items-table")');
    expect(tablePinning).toContain("أدوات تكبير جدول الأصناف والمخزون");
    expect(tablePinning).toContain('document.querySelectorAll<HTMLTableElement>("table")');
    const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(styles).toContain(".account-statement-scroll-region > table > thead");
    expect(styles).toContain(".account-statement-scroll-region > table .smart-table-pinned");
  });

  it("يتيح لكشوف الحساب تثبيت عمودين ويستبدل الأقدم عند اختيار عمود ثالث", () => {
    expect(getNextSmartPinnedColumns([], 1)).toEqual([1]);
    expect(getNextSmartPinnedColumns([1], 3)).toEqual([1, 3]);
    expect(getNextSmartPinnedColumns([1, 3], 5)).toEqual([3, 5]);
    expect(getNextSmartPinnedColumns([3, 5], 3)).toEqual([5]);
    expect(getSmartPinnedColumnOffsets([4, 1], [92, 176, 130, 142, 118])).toEqual([{ column: 1, offset: 0 }, { column: 4, offset: 176 }]);
    const constrainedLayout = getSmartPinnedColumnLayout([4, 1], [92, 176, 130, 142, 118], 200);
    expect(constrainedLayout.map(item => item.column)).toEqual([1, 4]);
    expect(constrainedLayout[0]?.offset).toBe(0);
    expect(constrainedLayout[0]?.width).toBeCloseTo(200 * 176 / (176 + 118));
    expect(constrainedLayout[1]?.offset).toBeCloseTo(constrainedLayout[0]?.width ?? 0);
    expect((constrainedLayout[1]?.offset ?? 0) + (constrainedLayout[1]?.width ?? 0)).toBeCloseTo(200);
    expect(getSmartPinnedColumnLayout([0, 1], [100, 100], 187.5)).toEqual([{ column: 0, offset: 0, width: 93.75 }, { column: 1, offset: 93.75, width: 93.75 }]);
  });

  it("يحوّل إجماليات البحث الخادمية للعدد والكمية والقيمة بأمان", () => {
    expect(normalizeMovementPageTotals({ total: "126", totalQuantity: "845.75", totalValue: "10250.50" })).toEqual({ total: 126, totalQuantity: 845.75, totalValue: 10250.5 });
    expect(normalizeMovementPageTotals(undefined)).toEqual({ total: 0, totalQuantity: 0, totalValue: 0 });
  });

  it("يميّز إجمالي كل الحركات عن إجمالي نتائج البحث", () => {
    const emptyFilters = { supplier: "all", customer: "all", item: "", permit: "", purpose: "", from: "", to: "" };
    expect(getMovementTotalsScopeLabel(emptyFilters)).toBe("كل الحركات");
    expect(getMovementTotalsScopeLabel({ ...emptyFilters, permit: "1024" })).toBe("نتائج البحث");
  });

  it("يثبّت العمود الذي اختاره المستخدم ويلغي التثبيت بلمسة ثانية", () => {
    expect(getNextPinnedMovementColumn(null, 3)).toBe(3);
    expect(getNextPinnedMovementColumn(3, 3)).toBeNull();
    expect(getNextPinnedMovementColumn(3, 6)).toBe(6);
  });

  it("يسمح بتثبيت عمودين ويستبدل الأقدم عند اختيار ثالث", () => {
    expect(getNextPinnedMovementColumns([], 2)).toEqual([2]);
    expect(getNextPinnedMovementColumns([2], 4)).toEqual([2, 4]);
    expect(getNextPinnedMovementColumns([2, 4], 6)).toEqual([4, 6]);
    expect(getNextPinnedMovementColumns([4, 6], 4)).toEqual([6]);
  });

  it("يجعل العمود الثاني يبدأ عند حافة العمود الأول الفعلية", () => {
    const offsets = getPinnedMovementColumnOffsets([2, 0], new Map([[0, 286], [2, 128]]));
    expect(offsets.get(0)).toBe(0);
    expect(offsets.get(2)).toBe(286);
  });

  it("يحافظ على ترويسة وصفوف جداول الحركات المتباينة في الوضعين", () => {
    const movementPage = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryPages.tsx"), "utf8");
    const pdfCanvas = readFileSync(resolve(process.cwd(), "client/src/components/PdfPageCanvas.tsx"), "utf8");
    const statementZoom = readFileSync(resolve(process.cwd(), "client/src/components/AccountStatementTableZoom.tsx"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(styles).toContain(".movement-data-table thead tr");
    expect(styles).toContain(".dark .movement-data-table thead tr");
    expect(styles).toContain(".movement-data-table tbody tr:nth-child(even)");
    expect(styles).toContain("استعادة جداول الحركات إلى بنية بسيطة");
    expect(styles).toContain("border: 0 !important");
    expect(styles).toContain("overflow: visible !important");
    expect(styles).toContain(".dark .movement-data-table tbody tr:nth-child(even)");
    expect(styles).toContain(".movement-table-scroller");
    expect(styles).toContain("position: sticky");
    expect(styles).not.toContain(".movement-table-pinned");
    expect(styles).not.toContain(".movement-table-pin-trigger");
    expect(styles).toContain("--smart-pinned-column-offset");
    expect(styles).toContain("مثبّت ٢");
    expect(styles).toContain(".smart-table-pinned");
    expect(styles).toContain(".smart-table-scroll-region > table thead th");
    expect(styles).toContain("inset-block-start: 0");
    expect(styles).toContain("@media print");
    expect(styles).toContain("background: #fff !important");
    expect(styles).toContain("scrollbar-color: #0d7180 #dceff3");
    expect(styles).toContain(".pdf-page-canvas-host { overflow: auto");
    const tablePinning = readFileSync(resolve(process.cwd(), "client/src/components/TableColumnPinning.tsx"), "utf8");
    expect(tablePinning).toContain("--smart-pinned-column-width");
    expect(styles).toContain("inline-size: max(100%, 1024px)");
    expect(tablePinning).not.toContain("smart-table-horizontal-scrollbar");
    expect(tablePinning).toContain("if (constrainedWidth + 0.5 < (headerWidths[column] ?? 0))");
    expect(styles).toContain("contain: none");
    expect(styles).toContain("clip-path: inset(0 round 0.7rem)");
    expect(styles).toContain("inset-block-start: 0 !important");
    expect(styles).toContain("top: 0 !important");
    expect(styles).toContain(".smart-table-scroll-region > table thead th");
    expect(styles).not.toContain("overflow: hidden; text-overflow: ellipsis; white-space: nowrap");
    expect(tablePinning).toContain("header.getBoundingClientRect().width / tableZoom");
    expect(tablePinning).toContain("scroller.getBoundingClientRect().width / tableZoom - 2");
    expect(tablePinning).toContain('scroller.dataset.smartTableScroller = "true"');
    expect(tablePinning).toContain('header.style.setProperty("position", "sticky", "important")');
    expect(tablePinning).toContain('cell.style.setProperty("inset-inline-start"');
    expect(tablePinning).toContain('scroller.style.overflowY = "auto"');
    expect(tablePinning).toContain('window.addEventListener("smart-table-refresh", refreshTable)');
    expect(statementZoom).toContain('new CustomEvent<HTMLTableElement>("smart-table-refresh"');
    expect(statementZoom).toContain("table.style.zoom = zoom === 1 ? previousZoom : String(zoom)");
    expect(statementZoom).not.toContain("account-statement-page-sticky-header");
    expect(statementZoom).not.toContain('table.classList.add("movement-data-table")');
    expect(movementPage).not.toContain("movement-page-sticky-header");
    expect(movementPage).toContain("movementTableZoom === 1 ? previousZoom : String(movementTableZoom)");
    expect(movementPage).toContain('new CustomEvent<HTMLTableElement>("smart-table-refresh"');
    expect(styles).toContain(".smart-table-scroll-region > table thead {");
    expect(movementPage).not.toContain("انقر بالماوس أو المس لتثبيت هذا العمود أثناء السحب");
    expect(movementPage).not.toContain('window.matchMedia("(max-width: 767px)").matches');
    expect(pdfCanvas).toContain("اسحب أفقيًا أو استخدم الشريط");
    expect(styles).toContain("flex-direction: column !important");
    expect(styles).toContain('.pdf-action-toolbar[data-pdf-collapsed="true"] > button:nth-of-type(n + 3)');
    expect(styles).toContain(".dark .movement-data-table tbody td:nth-child(6)");
    expect(styles).toContain("border-bottom");
    expect(styles).toContain("@media (hover: hover) and (pointer: fine)");
    expect(styles).toContain(".smart-table-scroll-region > table tbody > tr:hover > td");
    expect(styles).toContain(".dark .smart-table-scroll-region > table tbody > tr:hover > td");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("يجمع المخازن الخمسة داخل صفحة واحدة هادئة مع قوائم اختيار معتمدة للحركات", () => {
    const layout = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");
    const warehousePage = readFileSync(resolve(process.cwd(), "client/src/pages/WarehousesSuppliersPages.tsx"), "utf8");
    const homePage = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const assistant = readFileSync(resolve(process.cwd(), "client/src/components/WarehouseMovementAssistant.tsx"), "utf8");
    expect(layout).toContain('const warehouseMenuItems = [{ icon: Warehouse, label: "المخازن", path: "/warehouses" }]');
    expect(layout).not.toContain("buildWarehouseNavigationItems(warehouses.data");
    expect(warehousePage).toContain("function WarehouseSwitcher");
    expect(warehousePage).toContain("فروع المخازن ومخزن الهالك");
    expect(warehousePage).toContain("إخفاء");
    expect(warehousePage).toContain("items.warehouseCards.useQuery");
    expect(warehousePage).toContain("warehouseName: selected?.name");
    expect(warehousePage).toContain("معاينة تقرير {reportName}");
    expect(homePage).toContain("WAREHOUSE OVERVIEW");
    expect(homePage).toContain("عرض ${branchWarehouses.length} مخازن أخرى");
    expect(homePage).toContain("تحويل داخلي");
    expect(homePage).toContain("mainWarehouse");
    expect(homePage).toContain("صنف تحت الحد");
    expect(homePage).toContain("لا أصناف بعد");
    expect(homePage).toContain("مخزن هالك");
    expect(homePage).toContain("needsAttention");
    expect(homePage).toContain("warehouseLowStock.useQuery");
    expect(homePage).toContain("WarehouseBranchCard");
    expect(homePage).toContain("أصناف تحت الحد الأدنى");
    expect(homePage).toContain("items.slice(0, 5)");
    expect(homePage).toContain("حد الطلب:");
    expect(homePage).toContain("مرّر أو المس التفاصيل");
    expect(assistant).toContain('input.setAttribute("list", "inventory-warehouse-options")');
    expect(assistant).toContain('datalist id="inventory-warehouse-options"');
  });

  it("يستخرج تنبيهات الفروع من أرصدة المخازن الفعلية لا من قائمة الأصناف العامة", () => {
    const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(db).toContain("export async function listWarehouseLowStockItems()");
    expect(db).toContain(".from(itemWarehouseBalances)");
    expect(db).toContain("innerJoin(items, eq(items.id, itemWarehouseBalances.itemId))");
    expect(db).toContain('gt(items.reorderLevel, "0")');
    expect(router).toContain("warehouseLowStock: permissionProcedure(\"inventory\")");
  });

  it("يربط تقرير الجرد الشامل بالمصدر الخادمي ومعاينة PDF متعددة المخازن", () => {
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const auditPage = readFileSync(resolve(process.cwd(), "client/src/pages/InventoryAuditPage.tsx"), "utf8");
    const exportFiles = readFileSync(resolve(process.cwd(), "client/src/lib/inventoryExportFiles.ts"), "utf8");
    expect(router).toContain("inventoryAudit: permissionProcedure(\"reports\")");
    expect(auditPage).toContain("trpc.reports.inventoryAudit.useQuery");
    expect(auditPage).toContain("إجمالي الشركة");
    expect(exportFiles).toContain("buildCompanyInventoryAuditPdf");
    expect(exportFiles).toContain("تقرير الجرد الشامل حسب المخازن");
  });

  it("يعرض تسمية لِزوم الارتجاع ضمن خيارات أعمدة التصدير", () => {
    const reportsPage = readFileSync(resolve(process.cwd(), "client/src/pages/ReportsPage.tsx"), "utf8");
    expect(reportsPage).toContain('returnPurpose: "لِزوم الارتجاع"');
  });
});
