import { describe, expect, it } from "vitest";
import { buildMySqlSessionOptions } from "./_core/oauth";

describe("Railway MySQL OAuth session store", () => {
  it("parses an encoded MySQL connection URL into durable session-store options", () => {
    expect(buildMySqlSessionOptions("mysql://inventory%5Fuser:p%40ss@mysql.railway.internal:3306/inventory_db")).toMatchObject({
      host: "mysql.railway.internal",
      port: 3306,
      user: "inventory_user",
      password: "p@ss",
      database: "inventory_db",
      createDatabaseTable: true,
      expiration: 600000,
    });
  });

  it("rejects connection strings that omit the database name", () => {
    expect(() => buildMySqlSessionOptions("mysql://user:pass@mysql.railway.internal")).toThrow("DATABASE_URL must include a database name");
  });
});
