import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const reportsPageSource = readFileSync(new URL("../client/src/pages/ReportsPage.tsx", import.meta.url), "utf8");

describe("قابلية توسع بيانات التقارير", () => {
  it("يجلب جميع صفوف الحركات المطابقة من الخادم دون حد 500 سجل", () => {
    expect(databaseSource).toContain("export async function getReportDataset");
    expect(databaseSource).toContain("input.includeRows ? db.select().from(additions)");
    expect(databaseSource).toContain("db.select().from(additions).where(additionsWhere).orderBy(desc(additions.id))");
    expect(databaseSource).toContain("db.select().from(disbursements).where(disbursementsWhere).orderBy(desc(disbursements.id))");
    expect(databaseSource).toContain("db.select().from(transfers).where(transfersWhere).orderBy(desc(transfers.id))");
    const reportDatasetSection = databaseSource.slice(databaseSource.indexOf("export async function getReportDataset"), databaseSource.indexOf("export function isReturnTransfer"));
    expect(reportDatasetSection).not.toContain(".limit(500)");
  });

  it("يعرّض ملخصات الحركات والجهات والفروقات داخل مسار تقارير محمي", () => {
    expect(databaseSource).toContain("groupBy(additions.supplierId, additions.supplier)");
    expect(databaseSource).toContain("groupBy(disbursements.customerId, disbursements.destination)");
    expect(databaseSource).toContain("varianceRows");
    expect(routerSource).toContain("dataset: permissionProcedure(\"reports\")");
    expect(reportsPageSource).toContain("trpc.reports.dataset.useQuery");
    expect(reportsPageSource).toContain("includeRows: reportRowsRequired");
    expect(reportsPageSource).not.toContain("trpc.additions.list.useQuery({ limit: 500 }");
    expect(reportsPageSource).not.toContain("trpc.disbursements.list.useQuery({ limit: 500 }");
    expect(reportsPageSource).not.toContain("trpc.transfers.list.useQuery({ limit: 500 }");
  });
});
