import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "drizzle/0037_project_building_uniques.sql"), "utf8");

describe("عزل مباني المشاريع", () => {
  it("يعرّف الاسم والكود كقيود مركبة مع المشروع", () => {
    const buildingsBlock = schema.slice(schema.indexOf('export const buildings = mysqlTable'), schema.indexOf('export type Building'));
    expect(buildingsBlock).toContain('uniqueIndex("buildings_project_name_uq").on(table.projectId, table.name)');
    expect(buildingsBlock).toContain('uniqueIndex("buildings_project_code_uq").on(table.projectId, table.code)');
    expect(buildingsBlock).not.toMatch(/name: varchar\([^\n]+\)\.notNull\(\)\.unique\(\)/);
    expect(buildingsBlock).not.toMatch(/code: varchar\([^\n]+\)\.notNull\(\)\.unique\(\)/);
  });

  it("تزيل القيود العالمية وتضيف القيود المركبة فقط", () => {
    expect(migration).toContain("DROP INDEX `buildings_name_unique`");
    expect(migration).toContain("DROP INDEX `buildings_code_unique`");
    expect(migration).toContain("UNIQUE(`project_id`,`name`)");
    expect(migration).toContain("UNIQUE(`project_id`,`code`)");
    const sqlOnly = migration.replace(/^\s*--.*$/gm, "");
    expect(sqlOnly).not.toMatch(/\b(DELETE|UPDATE|INSERT)\b/i);
  });
});
