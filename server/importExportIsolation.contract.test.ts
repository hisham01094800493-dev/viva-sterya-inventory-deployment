import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * اختبارات تعاقدية لعزل الاستيراد والتصدير والباركود (المرحلة 9).
 *
 * الهدف: منع أي تراجع يعيد خلط بيانات المشاريع عند استيراد الأصناف أو الحركات،
 * أو عند تصدير التقارير وكروت الأصناف وأذون المخزون.
 * نقرأ الكود المصدري ونتحقق من أن:
 *  1) دالة resolveWarehouseId تحصر البحث داخل المشروع (بالاسم أو المعرّف أو slot).
 *  2) كل استدعاء لـ resolveWarehouseId يمرّر معرّف المشروع.
 *  3) إنشاء/تعديل الأصناف والحركات يحسب مشروع الكتابة قبل تحديد المخزن.
 *  4) قراءة أرصدة المخزن تُصفّى بمشروع الأصناف.
 *  5) واجهة الاستيراد تعرض اسم المشروع الهدف وتمنع الاستيراد بدون مشروع نشط.
 *  6) أسماء ملفات التصدير تحمل اسم المشروع عبر withReportProjectFile.
 *  7) راوتر الاستيراد يمرّر scope.projectId إلى طبقة البيانات.
 */

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const dbSource = read("server/db.ts");
const routerSource = read("server/routers.ts");
const inventoryPage = read("client/src/pages/InventoryPages.tsx");

describe("Phase 9 — import/export/barcode isolation contract", () => {
  it("scopes warehouse resolution by project instead of resolving globally", () => {
    const start = dbSource.indexOf("async function resolveWarehouseId(");
    expect(start).toBeGreaterThan(-1);
    const body = dbSource.slice(start, start + 1400);
    expect(body).toContain("projectId?: number | null");
    expect(body).toContain("eq(warehouses.projectId, projectId)");
    // كل الفروع الثلاثة (id / name / slot) يجب أن تستخدم الشرط نفسه.
    expect(body).toContain("eq(warehouses.id, warehouseId), projectCondition");
    expect(body).toContain("eq(warehouses.name, normalizedName), projectCondition");
    expect(body).toContain("eq(warehouses.slot, 1), projectCondition");
  });

  it("passes a project id into every resolveWarehouseId call", () => {
    const marker = "resolveWarehouseId(";
    let index = dbSource.indexOf(marker);
    let checked = 0;
    while (index > -1) {
      const before = dbSource.slice(Math.max(0, index - 40), index);
      if (!before.includes("async function")) {
        const call = dbSource.slice(index, index + 260);
        expect(/projectId|writeProjectId|ProjectId/.test(call)).toBe(true);
        checked += 1;
      }
      index = dbSource.indexOf(marker, index + marker.length);
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  it("resolves the write project before picking the warehouse", () => {
    for (const marker of ["export async function createItem", "export async function createAddition", "export async function createDisbursement"]) {
      const start = dbSource.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
      const body = dbSource.slice(start, start + 3200);
      const projectIndex = body.indexOf("resolveWriteProjectId(tx, input.projectId)");
      const warehouseIndex = body.indexOf("resolveWarehouseId(");
      expect(projectIndex).toBeGreaterThan(-1);
      expect(warehouseIndex).toBeGreaterThan(-1);
      expect(projectIndex).toBeLessThan(warehouseIndex);
    }
    // التحويل يفوّض تحديد المخازن إلى applyTransferWarehouseEffect، فيجب أن يمرّر مشروع الكتابة إليها.
    const transferStart = dbSource.indexOf("export async function createTransfer");
    expect(transferStart).toBeGreaterThan(-1);
    const transferBody = dbSource.slice(transferStart, transferStart + 2600);
    expect(transferBody).toContain("projectId: writeProjectId");
  });

  it("filters warehouse stock rows by the item project", () => {
    const start = dbSource.indexOf("export async function listWarehouseStockRows");
    expect(start).toBeGreaterThan(-1);
    const body = dbSource.slice(start, start + 1400);
    expect(body).toContain("eq(items.projectId, projectId)");
  });

  it("keeps every movement item lookup inside its project", () => {
    const calls = dbSource.split("\n").filter(line => line.includes("getItemForUpdate(tx,"));
    expect(calls.length).toBeGreaterThanOrEqual(13);
    for (const line of calls) {
      expect(/projectId|writeProjectId/.test(line)).toBe(true);
    }
  });

  it("scopes transfer warehouse effects by project", () => {
    const start = dbSource.indexOf("async function applyTransferWarehouseEffect(");
    expect(start).toBeGreaterThan(-1);
    const body = dbSource.slice(start, start + 2600);
    expect(body).toContain("projectId?: number | null");
    const marker = "resolveWarehouseId(";
    let index = body.indexOf(marker);
    let checked = 0;
    while (index > -1) {
      const call = body.slice(index, index + 200);
      expect(call).toContain("input.projectId");
      checked += 1;
      index = body.indexOf(marker, index + marker.length);
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("routes bulk imports through the resolved project scope", () => {
    expect(routerSource).toMatch(/importItems\(input\.rows, scope\.projectId\)/);
    expect(routerSource).toMatch(/importMovements\(input\.rows, scope\.projectId\)/);
  });

  it("shows the target project in both import dialogs and blocks import without one", () => {
    expect(inventoryPage).toContain("سيتم استيراد الأصناف إلى مشروع");
    expect(inventoryPage).toContain("سيتم استيراد الحركات إلى مشروع");
    expect(inventoryPage).toContain("!importProjectName || importMutation.isPending");
    expect(inventoryPage).toContain("!movementImportProjectName || importMutation.isPending");
  });

  it("tags exported file names with the active project", () => {
    const fileNames = [
      "smart-inventory-item-card-",
      "smart-inventory-stock-filtered.pdf",
      "smart-inventory-additions-search",
      "smart-inventory-disbursements-search",
      "smart-inventory-transfers-returns-search",
      "smart-inventory-permit-",
      "smart-inventory-executive-report-",
    ];
    for (const name of fileNames) {
      const lines = inventoryPage.split("\n").filter(line => line.includes(name));
      expect(lines.length).toBeGreaterThan(0);
      const guarded = lines.filter(line => line.includes("withReportProjectFile"));
      expect(guarded.length).toBe(lines.length);
    }
  });

  it("adds the project name to exported report titles", () => {
    expect(inventoryPage).toContain('withReportProject("تقرير الأصناف والمخزون - Smart Inventory"');
    expect(inventoryPage).toContain('withReportProject("التقرير التنفيذي اليومي - Smart Inventory"');
    expect(inventoryPage).toContain('withReportProject(kind === "additions"');
  });
});
