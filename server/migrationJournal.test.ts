import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = resolve(process.cwd(), "drizzle");
const journal = JSON.parse(
  readFileSync(resolve(drizzleDir, "meta/_journal.json"), "utf8")
) as { entries: { idx: number; tag: string; when: number }[] };

const sqlFiles = readdirSync(drizzleDir)
  .filter(file => file.endsWith(".sql"))
  .map(file => file.slice(0, -4))
  .sort();

/**
 * حماية من خطأ حقيقي حدث: ملف ترحيل موجود في المجلد لكنه غير مسجّل في _journal.json،
 * فيتخطاه Drizzle للأبد دون أي تحذير. هذا الاختبار يفشل فورًا لو تكرر.
 */
describe("سجل ترحيلات Drizzle", () => {
  it("كل ملف ترحيل .sql مسجّل في _journal.json", () => {
    const tags = journal.entries.map(entry => entry.tag);
    const missing = sqlFiles.filter(file => !tags.includes(file));
    expect(missing).toEqual([]);
  });

  it("لا يوجد مدخل في السجل بدون ملف .sql مقابل", () => {
    const orphans = journal.entries
      .map(entry => entry.tag)
      .filter(tag => !sqlFiles.includes(tag));
    expect(orphans).toEqual([]);
  });

  it("ترقيم idx متصل يبدأ من صفر بلا فجوات أو تكرار", () => {
    const indexes = journal.entries.map(entry => entry.idx);
    expect(indexes).toEqual(indexes.map((_, position) => position));
  });

  it("الترتيب الزمني when تصاعدي (يمنع ترتيب تنفيذ غير سليم)", () => {
    const times = journal.entries.map(entry => entry.when);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it("الترحيلات الحساسة للترتيب موجودة بالترتيب الصحيح", () => {
    const tags = journal.entries.map(entry => entry.tag);
    const position = (tag: string) => tags.indexOf(tag);
    expect(position("0036_lovely_titanium_man")).toBeGreaterThanOrEqual(0);
    expect(position("0037_project_building_uniques")).toBeGreaterThan(
      position("0036_lovely_titanium_man")
    );
    expect(position("0038_report_scheduler_project_isolation")).toBeGreaterThan(
      position("0037_project_building_uniques")
    );
    expect(position("0039_item_specifications")).toBeGreaterThan(
      position("0038_report_scheduler_project_isolation")
    );
  });
});
