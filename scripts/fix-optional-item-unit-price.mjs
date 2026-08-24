import { readFileSync, writeFileSync } from "node:fs";

const path = "/home/ubuntu/viva-sterya-inventory/client/src/pages/InventoryPages.tsx";
const source = readFileSync(path, "utf8");
const next = source.replaceAll("formatQuantity(item.unitPrice)", "formatQuantity((item as any).unitPrice)");

if (next === source) throw new Error("لم يتم العثور على عرض سعر الصنف لتصحيح نوعه");
writeFileSync(path, next, "utf8");
