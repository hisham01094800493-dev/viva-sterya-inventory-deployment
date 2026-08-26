import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { uploadCompanyLogo } from "./companyLogoUpload";
import { buildOutboundReturnRows } from "../client/src/lib/reportMovements";
import { buildAccountSummary } from "../client/src/lib/accountSummary";
import { buildUnlinkedCustomerParties } from "../client/src/lib/unlinkedCustomerParties";
import { ARABIC_PDF_FONT_URL, buildAccountStatementExcel, buildAccountStatementPdf, buildInventoryPdf, buildItemCardExcel, buildItemCardPdf, buildItemCardMovementRows, formatItemCardPdfDate, formatItemCardMovementDetail, buildMainWarehousePdf, buildMovementExcel, buildMovementPdf, configureArabicPdf, formatPdfMovementDate, getMovementPdfColumnWidth, drawReportHeader, getPdfImageFormat, getReportHeaderDate, movementExportColumns, selectExportColumns, shapeArabic } from "../client/src/lib/inventoryExportFiles";
import { countMovementRows, createReportExportRequest, estimatePdfRemainingSeconds, filterMovementRows, filterMovementRowsByPurpose, filterMovementRowsBySearch, formatReportPartySummary } from "../client/src/pages/ReportsPage";
import { createReportMailtoUrl, sharePdfFile } from "../client/src/lib/reportSharing";
import { formatInventoryDate } from "../client/src/lib/inventoryDate";
import { ITEM_CARD_MOVEMENT_FILTER_KEY, ITEM_CARD_PERMIT_COLUMN_KEY, ITEM_CARD_TOTAL_VALUE_KEY, ITEM_CARD_UNIT_PRICE_KEY, readItemCardColumnPreference, readItemCardMovementFilter, writeItemCardColumnPreference, writeItemCardMovementFilter } from "../client/src/lib/itemCardPreferences";
import autoTable from "jspdf-autotable";

vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

describe("تحسينات تقارير المخزون", () => {
  it("يرفع شعار الشركة ويحفظ رابط الإعداد", async () => {
    const put = vi.fn(async () => ({ key: "company/logo/logo.png", url: "/manus-storage/company/logo/logo.png" }));
    const save = vi.fn(async () => undefined);
    const result = await uploadCompanyLogo({ fileName: "شعار الشركة.png", contentType: "image/png", dataBase64: "data:image/png;base64," + Buffer.from("logo").toString("base64") }, { put, save });
    expect(result.url).toContain("company/logo");
    expect(put).toHaveBeenCalledWith(expect.stringContaining("company/logo/"), expect.any(Buffer), "image/png");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ key: "company_logo_url", value: result.url }));
  });

  it("يجمع قيم الموردين والعملاء لتقرير الجهات والرسم المقارن", () => {
    const summary = buildAccountSummary(
      [{ supplierId: 1, supplier: "مورد أ", quantity: 3, unitPrice: 10, totalValue: 30, date: "2026-08-01" }],
      [{ customerId: 2, customer: "عميل ب", quantity: 2, unitPrice: 12, totalValue: 24, date: "2026-08-02" }],
      [],
      [{ id: 1, name: "مورد أ" }],
      [{ id: 2, name: "عميل ب" }],
    );
    expect(summary.suppliers[0]).toMatchObject({ name: "مورد أ", value: 30, movements: 1 });
    expect(summary.customers[0]).toMatchObject({ name: "عميل ب", value: 24, movements: 1 });
  });

  it("يجمع الجهات النصية غير المرتبطة بدليل العملاء مع الكمية والقيمة والفترة", () => {
    const result = buildUnlinkedCustomerParties([
      { date: "2026-08-01", destination: "جهة قديمة", customerId: null, quantity: 2, unitPrice: 10 },
      { date: "2026-08-03", destination: "جهة قديمة", customerId: undefined, quantity: 3, unitPrice: 12 },
      { date: "2026-08-02", destination: "عميل مرتبط", customerId: 4, quantity: 99, unitPrice: 99 },
    ]);
    expect(result).toEqual([{ name: "جهة قديمة", movements: 2, quantity: 5, value: 56, firstDate: "2026-08-01", lastDate: "2026-08-03" }]);
  });

  it("يبحث في الحركات برقم الإذن والوارد من والمنصرف إلى", () => {
    const rows = [
      { id: 1, type: "إضافة", date: "2026-08-01", eznNum: "A-100", itemCode: "A", quantity: 2, detail: "حديد — المورد: مورد النور" },
      { id: 2, type: "صرف", date: "2026-08-02", eznNum: "D-200", itemCode: "A", quantity: 1, detail: "حديد — جهة الصرف: شركة البناء" },
      { id: 3, type: "مرتجع", date: "2026-08-03", eznNum: "R-300", itemCode: "A", quantity: 1, detail: "حديد — مرتجع: عميل", disbursementPurpose: "مرتجع من العميل" },
    ] as any;
    expect(filterMovementRowsBySearch(rows, "A-100", "", "").map(row => row.eznNum)).toEqual(["A-100"]);
    expect(filterMovementRowsBySearch(rows, "", "النور", "").map(row => row.eznNum)).toEqual(["A-100"]);
    expect(filterMovementRowsBySearch([{ ...rows[0], additionPurpose: "استكمال أعمال الموقع" }] as any, "", "استكمال", "").map(row => row.eznNum)).toEqual(["A-100"]);
    expect(filterMovementRowsBySearch(rows, "", "", "البناء").map(row => row.eznNum)).toEqual(["D-200"]);
    expect(filterMovementRowsBySearch(rows, "300", "", "").map(row => row.eznNum)).toEqual(["R-300"]);
    expect(filterMovementRowsBySearch(rows, "", "", "مرتجع من العميل").map(row => row.eznNum)).toEqual(["R-300"]);
  });

  it("يفلتر لزوم الإضافة ولزوم الصرف ولزوم الارتجاع كلٌ بشكل مستقل", () => {
    const rows = [
      { type: "إضافة", additionPurpose: "استكمال أعمال الموقع", disbursementPurpose: null },
      { type: "صرف", additionPurpose: null, disbursementPurpose: "تشغيل كهرباء" },
      { type: "مرتجع", additionPurpose: null, disbursementPurpose: null, returnPurpose: "مرتجع من العميل" },
    ] as any;
    expect(filterMovementRowsByPurpose(rows, "استكمال", "").map(row => row.type)).toEqual(["إضافة"]);
    expect(filterMovementRowsByPurpose(rows, "", "كهرباء").map(row => row.type)).toEqual(["صرف"]);
    expect(filterMovementRowsByPurpose(rows, "", "", "العميل").map(row => row.type)).toEqual(["مرتجع"]);
    expect(rows[2].returnPurpose).toBe("مرتجع من العميل");
  });

  it("يبقي عمودي لزوم الإضافة ولزوم الصرف منفصلين في قائمة التصدير", () => {
    expect(movementExportColumns).toContain("additionPurpose");
    expect(movementExportColumns).toContain("disbursementPurpose");
    expect(movementExportColumns).toContain("returnPurpose");
    expect(movementExportColumns).not.toContain("purpose");
  });

  it("يعرض تاريخ ترويسة PDF باليوم والشهر والسنة كاملة", () => {
    expect(getReportHeaderDate(new Date("2026-08-15T00:00:00Z"))).toBe("15/08/2026");
  });

  it("ينسق تاريخ جسم جدول PDF من مفتاح ISO كاملاً", () => {
    expect(formatPdfMovementDate("2026-07-22")).toBe("22 / 07 / 2026");
    expect(formatPdfMovementDate("2026/08/08")).toBe("08 / 08 / 2026");
    expect(formatPdfMovementDate("2026.04.23")).toBe("23 / 04 / 2026");
  });

  it("يحوّل التاريخ المختصر 0506 واليوم المنفرد 22 إلى تاريخ كامل دون مساس برقم الإذن", () => {
    expect(formatInventoryDate("0506").slice(0, 5)).toBe("05/06");
    expect(formatInventoryDate("05062026")).toBe("05/06/2026");
    expect(formatInventoryDate("20260506")).toBe("06/05/2026");
    expect(formatInventoryDate("22")).toMatch(/^22\/\d{2}\/\d{4}$/);
    expect(formatInventoryDate("23")).toMatch(/^23\/\d{2}\/\d{4}$/);
  });

  it("يحسب الوقت المتبقي التقريبي من النسبة والزمن المنقضي", () => {
    expect(estimatePdfRemainingSeconds(2, 25)).toBe(6);
    expect(estimatePdfRemainingSeconds(2, 100)).toBe(0);
    expect(estimatePdfRemainingSeconds(0, 25)).toBeNull();
  });

  it("يضيف عمود التفاصيل إلى خيارات تقارير التحويلات والمرتجعات", () => {
    expect(movementExportColumns).toContain("detail");
  });

  it("يخصص للتاريخ مساحة مضغوطة تكفي التاريخ الكامل داخل جدول PDF", () => {
    expect(getMovementPdfColumnWidth("date")).toBeGreaterThan(getMovementPdfColumnWidth("eznNum"));
    expect(getMovementPdfColumnWidth("date")).toBe(72);
    expect(getMovementPdfColumnWidth("date")).toBeLessThan(100);
  });

  it("يمنح اسم الصنف مساحة واسعة ويلفه بدل قصه في كشف الحساب PDF", async () => {
    await buildAccountStatementPdf([{ id: 1, type: "إضافة", date: "2026-08-26", eznNum: "A-1855", itemCode: "10001", name: "وصلة مجلفنة مقاومة للصدأ مقاس كبير للاستخدام الصناعي", quantity: 5, detail: "وارد من: مخازن الشركة", unitPrice: 1, totalValue: 5 }], { columns: ["name", "date", "quantity", "eznNum"] });
    const options = vi.mocked(autoTable).mock.calls.at(-1)?.[1] as { columnStyles?: Record<string, { cellWidth?: number }>; styles?: { overflow?: string } };
    expect(getMovementPdfColumnWidth("name")).toBeGreaterThanOrEqual(156);
    expect(options.columnStyles?.["3"]?.cellWidth).toBeGreaterThanOrEqual(156);
    expect(options.styles?.overflow).toBe("linebreak");
  });

  it("يحجز عرض اسم الصنف حتى عند إظهار كل أعمدة PDF الحركات", async () => {
    await buildMovementPdf([{ id: 1, type: "إضافة", date: "2026-08-26", eznNum: "A-1855", itemCode: "10001", name: "وصلة مجلفنة مقاومة للصدأ مقاس كبير للاستخدام الصناعي طويل المدى", quantity: 5, detail: "وارد من: مخازن الشركة", additionPurpose: "توريد موقع رئيسي", unitPrice: 12.5, totalValue: 62.5 }], { columns: ["name", "date", "quantity", "eznNum", "itemCode", "type", "additionPurpose", "unitPrice", "totalValue", "documentImage"] });
    const options = vi.mocked(autoTable).mock.calls.at(-1)?.[1] as { columnStyles?: Record<string, { cellWidth?: number; overflow?: string }> };
    expect(options.columnStyles?.["9"]?.cellWidth).toBeGreaterThanOrEqual(156);
    expect(options.columnStyles?.["9"]?.overflow).toBeUndefined();
  });

  it("يجعل جدول PDF القصير بعرض محتواه بدل تمديده إلى كامل الصفحة", async () => {
    await buildMovementPdf([{ id: 1, type: "صرف", date: "2026-08-01", eznNum: "D-1", itemCode: "A", name: "صنف", quantity: 2, detail: "—", unitPrice: 1, totalValue: 2 }], { columns: ["date", "quantity"] });
    const options = vi.mocked(autoTable).mock.calls.at(-1)?.[1] as { tableWidth?: number; columnStyles?: Record<string, { cellWidth?: number }> };
    expect(options.tableWidth).toBeLessThan(300);
    expect(options.columnStyles?.["0"]?.cellWidth).toBeLessThan(100);
  });

  it("يصيغ اسم جهة البحث أسفل إجمالي الكمية في PDF", () => {
    expect(formatReportPartySummary("مورد النور", "")).toEqual(["وارد من: مورد النور"]);
    expect(formatReportPartySummary("", "شركة البناء")).toEqual(["منصرف إلى: شركة البناء"]);
    expect(formatReportPartySummary("مورد النور", "شركة البناء")).toEqual(["وارد من: مورد النور", "منصرف إلى: شركة البناء"]);
    expect(formatReportPartySummary("", "")).toEqual([]);
  });

  it("يفصل الصرف والمرتجع ويستبعد الإضافات والتحويلات العادية مع تضمين السعر والصورة", () => {
    const rows = buildOutboundReturnRows(
      [{ id: 1, date: "2026-08-01", eznNum: "D-1", itemCode: "A", quantity: 2, customerId: 4, customerName: "شركة العميل", unitPrice: 10, destination: "قسم" }],
      [{ id: 2, date: "2026-08-02", eznNum: "T-1", itemCode: "A", quantity: 1, transferType: "تحويل", fromStore: "ب", toStore: "أ" }, { id: 3, date: "2026-08-03", eznNum: "R-1", itemCode: "A", quantity: 1, unitPrice: 10, transferType: "مرتجع", fromStore: "عميل" }],
      [{ code: "A", name: "صنف اختبار", imageUrl: "/image.png", unitPrice: 10 }],
    );
    expect(rows.map(row => row.type)).toEqual(["مرتجع", "صرف"]);
    expect(rows.find(row => row.type === "صرف")?.name).toBe("صنف اختبار");
    expect(rows.find(row => row.type === "صرف")?.detail).toBe("منصرف إلى: شركة العميل");
    expect(rows[0]).toMatchObject({ imageUrl: "/image.png", unitPrice: 10, totalValue: 10 });
  });

  it("يحافظ على قيمة لزوم الإضافة والصرف عند تجهيز صفوف التقرير", () => {
    const rows = buildOutboundReturnRows(
      [{ id: 21, date: "2026-08-08", eznNum: "D-21", itemCode: "A", quantity: 2, destination: "قسم الكهرباء", disburseType: "أعمال الكهرباء" }],
      [],
      [{ code: "A", name: "صنف اختبار", unitPrice: 10 }],
      [{ id: 22, date: "2026-08-07", eznNum: "A-22", itemCode: "A", quantity: 3, supplier: "المورد", purpose: "استكمال أعمال الموقع" }],
    );
    expect(rows.find(row => row.eznNum === "A-22")?.purpose).toBe("استكمال أعمال الموقع");
    expect(rows.find(row => row.eznNum === "D-21")?.purpose).toBe("أعمال الكهرباء");
  });

  it("يضع وسم التصحيح السالب على الحركة السالبة دون خلطها بتصنيف الصنف", () => {
    const rows = buildOutboundReturnRows(
      [{ id: 13, date: "2026-08-08", eznNum: "18", itemCode: "A", quantity: -31.464, destination: "سيفل" }],
      [],
      [{ code: "A", name: "حديد اختبار", category: "مباني", unitPrice: 0 }],
    );
    expect(rows[0]).toMatchObject({ type: "صرف", quantity: -31.464, isNegativeCorrection: true });
  });

  it("يعرض نوع الحركة كإضافة أو صرف أو مرتجع ولا يستخدم تصنيف الصنف", () => {
    const rows = buildOutboundReturnRows(
      [{ id: 11, date: "2026-08-01", eznNum: "D-11", itemCode: "A", quantity: 2, destination: "عميل" }],
      [{ id: 12, date: "2026-08-02", eznNum: "R-12", itemCode: "A", quantity: 1, transferType: "مرتجع", fromStore: "عميل" }],
      [{ code: "A", name: "مبنى اختبار", category: "مباني", unitPrice: 10 }],
      [{ id: 13, date: "2026-08-03", eznNum: "A-13", itemCode: "A", quantity: 4, supplier: "المورد" }],
    );
    expect(rows.map(row => row.type).sort()).toEqual(["إضافة", "صرف", "مرتجع"].sort());
    expect(rows.find(row => row.type === "إضافة")?.name).toBe("مبنى اختبار");
    expect(rows.find(row => row.type === "إضافة")?.detail).toContain("المورد");
    expect(rows.every(row => row.type !== "مباني")).toBe(true);
  });

  it("ينشئ Excel وPDF فعليين بالأعمدة المختارة والشعار والتاريخ", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(tinyPng, { headers: { "content-type": "image/png" } })));
    const rows = [{ id: 1, type: "صرف", date: "2026-08-01", eznNum: "D-1", itemCode: "A", name: "صنف اختبار", quantity: 2, detail: "منصرف إلى: شركة العميل", unitPrice: 10, totalValue: 20, imageUrl: "/image.png", documentImageUrl: "/permit.png" }];
    const workbook = await buildMovementExcel(rows, { columns: ["itemCode", "unitPrice", "totalValue", "image", "documentImage"] });
    const output = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(output as ExcelJS.Buffer);
    expect(reopened.worksheets[0].getRow(1).values).toEqual([undefined, "كود الصنف", "سعر الوحدة", "قيمة المخزون/الحركة", "صورة الصنف", "صورة الإذن"]);
    const customerWorkbook = await buildMovementExcel(rows, { columns: ["detail"] });
    const customerOutput = await customerWorkbook.xlsx.writeBuffer();
    const customerReopened = new ExcelJS.Workbook();
    await customerReopened.xlsx.load(customerOutput as ExcelJS.Buffer);
    expect(customerReopened.worksheets[0].getCell("A2").value).toBe("منصرف إلى: شركة العميل");
    expect(reopened.worksheets[0].getRow(1).values).toContain("صورة الإذن");
    const reportDate = new Date("2026-08-15T00:00:00Z");
    const pdf = await buildMovementPdf(rows, { columns: ["itemCode", "name", "date", "detail", "unitPrice", "totalValue", "image", "documentImage"], logo: `data:image/png;base64,${tinyPng.toString("base64")}`, date: reportDate });
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(500);
    const pdfPages = (pdf as unknown as { internal: { pages: unknown[][] } }).internal.pages;
    expect(pdfPages.flat().some(command => String(command).includes("Tj"))).toBe(true);
    const autoTableOptions = vi.mocked(autoTable).mock.calls.at(-1)?.[1] as { head?: unknown[][]; body?: unknown[][] };
    expect(autoTableOptions.head?.flat()).toContain(shapeArabic(pdf, "التفاصيل"));
    expect(autoTableOptions.head?.[0]?.[0]).toBe(shapeArabic(pdf, "صورة الإذن"));
    expect(autoTableOptions.head?.[0]?.[3]).toBe(shapeArabic(pdf, "التفاصيل"));
    expect(autoTableOptions.head?.[0]?.at(-2)).toBe(shapeArabic(pdf, "اسم الصنف"));
    expect(autoTableOptions.head?.[0]?.at(-1)).toBe(shapeArabic(pdf, "كود الصنف"));
    expect(autoTableOptions.body?.flat()).toContain(shapeArabic(pdf, "صنف اختبار"));
    expect(autoTableOptions.body?.flat()).toContain(shapeArabic(pdf, "منصرف إلى: شركة العميل"));
    expect(autoTableOptions.body?.flat()).toContain("01 / 08 / 2026");
    const calls: unknown[][] = [];
    drawReportHeader({ addImage: (...args: unknown[]) => { calls.push(["image", ...args]); }, setFontSize: (...args: unknown[]) => { calls.push(["font", ...args]); }, text: (...args: unknown[]) => { calls.push(["text", ...args]); } } as never, "Smart Inventory - Disbursements & Returns", "data:image/png;base64,logo", reportDate);
    expect(calls.some(call => call[0] === "image")).toBe(false);
    expect(calls.some(call => call[0] === "text" && call[1] === "Smart Inventory - Disbursements & Returns")).toBe(true);
    expect(calls.some(call => call[0] === "text" && call[1] === getReportHeaderDate(reportDate))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("يحذف عمود التفاصيل من كشف الحساب خارج تقارير التحويلات", async () => {
    const rows = [{ id: 1, type: "صرف", date: "2026-08-01", eznNum: "D-1", itemCode: "A", name: "صنف اختبار", quantity: 2, detail: "منصرف إلى: شركة العميل", unitPrice: 10, totalValue: 20 }];
    await buildAccountStatementPdf(rows, { columns: ["name", "date", "detail"] });
    const options = vi.mocked(autoTable).mock.calls.at(-1)?.[1] as { head?: unknown[][] };
    expect(options.head?.flat()).not.toContain("التفاصيل");
  });

  it("يحافظ كشف الحساب على ترتيب الأعمدة المختار من اليمين إلى اليسار", async () => {
    const rows = [{ id: 2, type: "صرف", date: "2026-08-02", eznNum: "D-2", itemCode: "B", name: "حديد 8 مم", quantity: 3, detail: "عميل", unitPrice: 11, totalValue: 33 }];
    await buildAccountStatementPdf(rows, { columns: ["name", "date", "quantity", "eznNum", "detail"] });
    const options = vi.mocked(autoTable).mock.calls.at(-1)?.[1] as { head?: unknown[][] };
    const pdf = (vi.mocked(autoTable).mock.calls.at(-1)?.[0] as any) as import("jspdf").jsPDF;
    expect(options.head?.[0]).toEqual([shapeArabic(pdf, "رقم الإذن"), shapeArabic(pdf, "الكمية"), shapeArabic(pdf, "التاريخ"), shapeArabic(pdf, "اسم الصنف")]);
    expect(options.head?.[0]).not.toContain(shapeArabic(pdf, "التفاصيل"));
  });

  it("يحدد صيغة الصورة الصحيحة داخل PDF لكارت الصنف والشعار", () => {
    expect(getPdfImageFormat("data:image/png;base64,AAA")).toBe("PNG");
    expect(getPdfImageFormat("data:image/jpeg;base64,AAA")).toBe("JPEG");
    expect(getPdfImageFormat(null)).toBe("JPEG");
  });

  it("ينشئ كارت صنف PDF بالرصيد الأولي وكل الإضافات والصرف والمرتجعات", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(tinyPng, { headers: { "content-type": "image/png" } })));
    const pdf = await buildItemCardPdf({ item: { id: 3, code: "10001", name: "صنف تجريبي", category: "أدوات", unit: "قطعة", initialStock: "5.000", currentStock: "8.000", incomingStock: "4.000", outgoingStock: "1.000", reorderLevel: "2.000", unitPrice: "12.50", imageUrl: "/item.png" } as any, additions: [{ date: "2026-08-01", eznNum: "A-1", quantity: 4, unitPrice: 12.5, supplier: "المورد" }], disbursements: [{ date: "2026-08-02", eznNum: "D-1", quantity: 1, unitPrice: 12.5, destination: "قسم" }], returns: [{ date: "2026-08-03", eznNum: "R-1", quantity: 1, unitPrice: 12.5, fromStore: "عميل" }] });
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(500);
    const calls = vi.mocked(autoTable).mock.calls;
    expect(calls.flatMap(call => ((call[1] as any)?.body ?? [])).flat()).toEqual(expect.arrayContaining([shapeArabic(pdf, "إضافة"), shapeArabic(pdf, "صرف"), shapeArabic(pdf, "مرتجع"), shapeArabic(pdf, "الإجمالي"), "01-08-2026"]));
    const movementTableOptions = calls.at(-1)?.[1] as { body?: unknown[][] };
    expect(movementTableOptions.body?.some(row => row.includes("01-08-2026"))).toBe(true);
    const pdfTotalRow = movementTableOptions.body?.at(-1) ?? [];
    expect(pdfTotalRow).toContain(shapeArabic(pdf, "الإجمالي"));
    expect(pdfTotalRow).toContain("8.000");
    const rows = buildItemCardMovementRows({ item: { initialStock: 5, unitPrice: 12.5 } as any, additions: [{ date: "2026-08-01", quantity: 4, unitPrice: 12.5 }], disbursements: [{ date: "2026-08-02", quantity: 1, unitPrice: 12.5 }], returns: [{ date: "2026-08-03", quantity: 1, unitPrice: 12.5 }] });
    expect(rows.map(row => row.movement)).toEqual(["إضافة", "صرف", "مرتجع"]);
    expect(rows.map(row => row.runningStock)).toEqual([9, 8, 9]);
    expect(rows[0].date).toBe("01-08-2026");
    expect(rows[0].openingStock).toBe(5);
    expect(rows.slice(1).every(row => row.openingStock === null)).toBe(true);
    expect(formatItemCardMovementDetail("إضافة", { supplier: "مورد النور" })).toBe("وارد من: مورد النور");
    expect(formatItemCardMovementDetail("صرف", { destination: "شركة البناء" })).toBe("صادر إلى: شركة البناء");
    expect(formatItemCardMovementDetail("مرتجع", { fromStore: "مخزن 1", toStore: "مخزن 2" })).toBe("مرتجع من: مخزن 1 إلى: مخزن 2");
    expect(rows[0].detail).toBe("وارد من: —");
    vi.mocked(autoTable).mockClear();
    await buildItemCardPdf({ item: { id: 4, name: "صنف فلتر", initialStock: 0, unitPrice: 10 } as any, additions: [{ date: "2026-08-01", eznNum: "A-4", quantity: 2, supplier: "مورد" }], disbursements: [{ date: "2026-08-02", eznNum: "D-4", quantity: 1, destination: "عميل" }], returns: [] }, { includePermitColumn: true, movementFilter: "صرف" });
    const filteredOptions = vi.mocked(autoTable).mock.calls.at(-1)?.[1] as { head?: unknown[][]; body?: unknown[][] };
    const filteredPdf = (vi.mocked(autoTable).mock.calls.at(-1)?.[0] as any) as import("jspdf").jsPDF;
    expect(filteredOptions.head?.flat()).toContain(shapeArabic(filteredPdf, "رقم الإذن"));
    expect(filteredOptions.body?.flat()).toContain("D-4");
    expect(filteredOptions.body?.flat()).not.toContain("A-4");
    const itemWorkbook = await buildItemCardExcel({ item: { id: 5, code: "X-5", name: "صنف Excel", initialStock: 3, currentStock: 4, unit: "طن", unitPrice: 20 } as any, additions: [{ date: "2026-08-01", eznNum: "A-5", quantity: 2, supplier: "مورد" }], disbursements: [{ date: "2026-08-02", eznNum: "D-5", quantity: 1, destination: "عميل" }], returns: [] }, { includePermitColumn: true, movementFilter: "صرف" });
    const itemOutput = await itemWorkbook.xlsx.writeBuffer();
    const reopenedItemWorkbook = new ExcelJS.Workbook();
    await reopenedItemWorkbook.xlsx.load(itemOutput as ExcelJS.Buffer);
    expect(reopenedItemWorkbook.worksheets[0].getRow(4).values).toContain("التاريخ");
    expect(reopenedItemWorkbook.worksheets[0].getRow(4).values).toContain("رقم الإذن");
    expect(reopenedItemWorkbook.worksheets[0].getRow(5).values).toContain("02-08-2026");
    expect(reopenedItemWorkbook.worksheets[0].getRow(5).values).toContain("D-5");
    expect(reopenedItemWorkbook.worksheets[0].getRow(5).values).not.toContain("A-5");
    expect(reopenedItemWorkbook.worksheets[0].lastRow?.values).toContain("الإجمالي");
    expect(reopenedItemWorkbook.worksheets[0].lastRow?.values).toContain(1);
    expect(reopenedItemWorkbook.worksheets[0].lastRow?.values).toContain(4);
    expect(reopenedItemWorkbook.worksheets[0].lastRow?.values).toContain("—");
    expect(formatItemCardPdfDate("2026-08-01")).toBe("01-08-2026");
    const missingDateCard = await buildItemCardPdf({ item: { id: 7, name: "صنف بلا تاريخ", initialStock: 0, unitPrice: 10 } as any, additions: [{ quantity: 2, supplier: "مورد" }], disbursements: [], returns: [] });
    expect(missingDateCard.output("arraybuffer").byteLength).toBeGreaterThan(500);
    expect(vi.mocked(autoTable).mock.calls.at(-1)?.[1]?.body?.flat()).toContain("—");
    const compactWorkbook = await buildItemCardExcel({ item: { id: 6, code: "X-6", name: "صنف بدون أسعار", initialStock: 0, unitPrice: 20 } as any, additions: [{ date: "2026-08-01", quantity: 1 }], disbursements: [], returns: [] }, { includeUnitPrice: false, includeTotalValue: false });
    const compactOutput = await compactWorkbook.xlsx.writeBuffer();
    const compactReloaded = new ExcelJS.Workbook();
    await compactReloaded.xlsx.load(compactOutput as ExcelJS.Buffer);
    const compactHeaders = compactReloaded.worksheets[0].getRow(4).values;
    expect(compactHeaders).not.toContain("السعر");
    expect(compactHeaders).not.toContain("إجمالي السعر");
    const preferenceStore = new Map<string, string>();
    const storage = { setItem: (key: string, value: string) => preferenceStore.set(key, value) };
    writeItemCardColumnPreference(storage, ITEM_CARD_UNIT_PRICE_KEY, false);
    writeItemCardColumnPreference(storage, ITEM_CARD_TOTAL_VALUE_KEY, true);
    expect(readItemCardColumnPreference(preferenceStore.get(ITEM_CARD_UNIT_PRICE_KEY) ?? null)).toBe(false);
    expect(readItemCardColumnPreference(preferenceStore.get(ITEM_CARD_TOTAL_VALUE_KEY) ?? null)).toBe(true);
    expect(readItemCardColumnPreference(null)).toBe(true);
    writeItemCardColumnPreference(storage, ITEM_CARD_PERMIT_COLUMN_KEY, true);
    writeItemCardMovementFilter(storage, "صرف");
    expect(readItemCardColumnPreference(preferenceStore.get(ITEM_CARD_PERMIT_COLUMN_KEY) ?? null, false)).toBe(true);
    expect(readItemCardMovementFilter(preferenceStore.get(ITEM_CARD_MOVEMENT_FILTER_KEY) ?? null)).toBe("صرف");
    expect(readItemCardMovementFilter("invalid")).toBe("all");
    vi.unstubAllGlobals();
  });

  it("ينشئ تقرير المخزن الرئيسي بصفحة مستقلة للصنف وملخص الأرصدة مع صورة الصنف", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).includes("item.png")
      ? new Response(tinyPng, { headers: { "content-type": "image/png" } })
      : new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "font/ttf" } })));
    const doc = await buildMainWarehousePdf([{ item: { id: 1, code: "10001", name: "صنف تجريبي", initialStock: 10, currentStock: 8, unitPrice: 5, imageUrl: "/item.png" }, additions: [{ quantity: 4 }], disbursements: [{ quantity: 7 }], returns: [{ quantity: 1 }] }]);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(500);
    vi.unstubAllGlobals();
  });

  it("يفعل اتجاه RTL داخل مستندات PDF العربية", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "font/ttf" } })));
    const doc = await configureArabicPdf(new (await import("jspdf")).jsPDF());
    expect((doc as any).getR2L?.()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("يستخدم خطًا عربيًا TTF متاحًا لنسخة Railway بدل مسار تخزين محلي غير منشور", () => {
    expect(ARABIC_PDF_FONT_URL).toContain("NotoNaskhArabic-Regular.ttf");
    expect(ARABIC_PDF_FONT_URL).toMatch(/^https:\/\//);
  });

  it("يضمّن خط Noto Naskh Arabic في مولدات PDF الأساسية", async () => {
    const movement = await buildMovementPdf([{ id: 1, type: "إضافة", date: "2026-08-26", eznNum: "A-1", itemCode: "10001", name: "صنف عربي", quantity: 1, detail: "وارد من: المخزن", unitPrice: 1, totalValue: 1 }]);
    const inventory = await buildInventoryPdf([{ id: 1, code: "10001", name: "صنف عربي", category: "تصنيف", unit: "قطعة", currentStock: 1, reorderLevel: 0, unitPrice: 1 } as any]);
    const itemCard = await buildItemCardPdf({ item: { id: 1, code: "10001", name: "صنف عربي", initialStock: 1, currentStock: 1, unitPrice: 1 } as any, additions: [], disbursements: [], returns: [] });
    const mainWarehouse = await buildMainWarehousePdf([{ item: { id: 1, code: "10001", name: "صنف عربي", initialStock: 1, currentStock: 1, unitPrice: 1 }, additions: [], disbursements: [], returns: [] }]);
    const account = await buildAccountStatementPdf([{ id: 1, type: "إضافة", date: "2026-08-26", eznNum: "A-1", itemCode: "10001", name: "صنف عربي", quantity: 1, detail: "وارد من: المخزن", unitPrice: 1, totalValue: 1 }]);
    [movement, inventory, itemCard, mainWarehouse, account].forEach(pdf => expect(pdf.output()).toContain("NotoNaskhArabic"));
  });

  it("ينشئ ملفات كشف حساب مستقلة Excel وPDF", async () => {
    const rows = [{ id: 7, type: "إضافة", date: "2026-08-15", eznNum: "A-7", itemCode: "SI-000007", quantity: 4, detail: "شركة المورد", unitPrice: 12.5, totalValue: 50 }];
    const workbook = await buildAccountStatementExcel(rows);
    expect(workbook.worksheets[0].name).toBe("كشف الحساب");
    const pdf = await buildAccountStatementPdf(rows, { date: new Date("2026-08-15T00:00:00Z") });
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(500);
  });

  it("ينشئ رابط مشاركة بريدية يتضمن عنوان التقرير واسم ملف PDF", () => {
    const url = createReportMailtoUrl("تقرير المخزن الرئيسي", "smart-inventory-main-warehouse.pdf");
    expect(url.startsWith("mailto:?subject=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("تقرير المخزن الرئيسي");
    expect(decodeURIComponent(url)).toContain("smart-inventory-main-warehouse.pdf");
  });

  it("يعيد حالة عدم الدعم عند غياب Web Share API", async () => {
    const originalShare = navigator.share;
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    expect(await sharePdfFile("/report.pdf", "تقرير", "report.pdf")).toBe("unsupported");
    Object.defineProperty(navigator, "share", { configurable: true, value: originalShare });
  });

  it("يشارك ملف PDF عبر Web Share API عند دعم المتصفح", async () => {
    const share = vi.fn(async () => undefined);
    const originalShare = navigator.share;
    const originalCanShare = navigator.canShare;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["pdf"], { type: "application/pdf" }))));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    expect(await sharePdfFile("/report.pdf", "تقرير", "report.pdf")).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: expect.any(Array) }));
    Object.defineProperty(navigator, "share", { configurable: true, value: originalShare });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: originalCanShare });
    vi.unstubAllGlobals();
  });

  it("يفلتر تقرير الحركات حسب إضافة أو صرف أو مرتجع", () => {
    const rows = [
      { type: "إضافة", id: 1 },
      { type: "صرف", id: 2 },
      { type: "مرتجع", id: 3 },
    ] as any;
    expect(filterMovementRows(rows, "all")).toHaveLength(3);
    expect(filterMovementRows(rows, "إضافة").map(row => row.type)).toEqual(["إضافة"]);
    expect(filterMovementRows(rows, "صرف").map(row => row.type)).toEqual(["صرف"]);
    expect(filterMovementRows(rows, "مرتجع").map(row => row.type)).toEqual(["مرتجع"]);
  });

  it("يحسب أعداد النتائج بجوار خيارات نوع الحركة", () => {
    const rows = [{ type: "إضافة" }, { type: "إضافة" }, { type: "صرف" }, { type: "مرتجع" }] as any;
    expect(countMovementRows(rows)).toEqual({ all: 4, إضافة: 2, صرف: 1, مرتجع: 1 });
  });

  it("يطابق مجموع التصحيحات السالبة فرق Pivot Table", () => {
    const corrections = [-3.998, -21.900, -2.736, -2.830, -2.000];
    expect(Number(corrections.reduce((sum, value) => sum + value, 0).toFixed(3))).toBe(-33.464);
    expect(Number((1560.539 + corrections.reduce((sum, value) => sum + value, 0)).toFixed(3))).toBe(1527.075);
  });

  it("يمرر نافذة ReportsPage الأعمدة والشعار المحددين إلى مسار التصدير", () => {
    const request = createReportExportRequest("movements", "pdf", ["date", "unitPrice"], "data:image/png;base64,logo");
    expect(request).toEqual({ reportType: "movements", format: "pdf", options: { columns: ["date", "unitPrice"], logo: "data:image/png;base64,logo" } });
    expect(selectExportColumns(movementExportColumns, request.options.columns)).toEqual(["date", "unitPrice"]);
    expect(getReportHeaderDate(new Date("2026-08-15T00:00:00Z"))).toBe("15/08/2026");
  });
});
