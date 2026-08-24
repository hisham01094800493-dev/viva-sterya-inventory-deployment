import { readFileSync, writeFileSync } from "node:fs";

const path = "/home/ubuntu/viva-sterya-inventory/client/src/pages/InventoryPages.tsx";
let source = readFileSync(path, "utf8");

const replacements = [
  ['<div className="grid gap-3 p-3 md:hidden">{items.map(item =>', '<div className="inventory-item-cards grid gap-3 p-3 md:hidden">{items.map(item =>'],
  ['<table className="w-full min-w-[850px] text-right">', '<table className="inventory-items-table w-full min-w-[850px] text-right">'],
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) throw new Error(`لم يتم العثور على النص: ${from}`);
  source = source.replace(from, to);
}

writeFileSync(path, source, "utf8");
