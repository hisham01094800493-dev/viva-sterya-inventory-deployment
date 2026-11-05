/**
 * مواصفات الأصناف (سيراميك / رخام).
 *
 * القاعدة الأساسية: الصنف العادي يبقى بسيطًا بلا أي حقول مواصفات. حقول
 * المواصفات اختيارية وقابلة للتركيب على الأصناف القديمة (فارغة افتراضيًا).
 * كل توليفة (مقاس + تون/سمك) تبقى صنفًا مستقلًا بكوده ورصيده وحركاته.
 */

export const ITEM_TYPES = ["general", "ceramic", "marble"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  general: "عادي",
  ceramic: "سيراميك",
  marble: "رخام",
};

export type ItemSpecInput = {
  itemType?: ItemType | null;
  sizeLengthCm?: number | string | null;
  sizeWidthCm?: number | string | null;
  tone?: string | null;
  thicknessCm?: number | string | null;
  specGroupKey?: string | null;
};

export type NormalizedItemSpec = {
  itemType: ItemType;
  sizeLengthCm: string | null;
  sizeWidthCm: string | null;
  tone: string | null;
  thicknessCm: string | null;
  specGroupKey: string | null;
};

export class ItemSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItemSpecError";
  }
}

function parseOptionalDimension(
  value: number | string | null | undefined,
  label: string
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ItemSpecError(`${label} يجب أن يكون رقمًا صحيحًا`);
  }
  if (parsed <= 0) {
    throw new ItemSpecError(`${label} يجب أن يكون أكبر من صفر`);
  }
  return parsed;
}

function parseOptionalText(
  value: string | null | undefined,
  maxLength: number,
  label: string
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new ItemSpecError(`${label} يجب ألا يتجاوز ${maxLength} حرفًا`);
  }
  return trimmed;
}

/**
 * يتحقق من توافق نوع الصنف مع حقول المواصفات ويعيد القيم بصيغة جاهزة
 * للتخزين في قاعدة البيانات. يرفض خلط مواصفات السيراميك بالرخام والعكس،
 * ويرفض أي مواصفة على الصنف العادي.
 */
export function normalizeItemSpec(input: ItemSpecInput): NormalizedItemSpec {
  const itemType = (input.itemType ?? "general") as ItemType;
  if (!ITEM_TYPES.includes(itemType)) {
    throw new ItemSpecError("نوع الصنف غير معروف");
  }

  const length = parseOptionalDimension(input.sizeLengthCm, "طول المقاس");
  const width = parseOptionalDimension(input.sizeWidthCm, "عرض المقاس");
  const thickness = parseOptionalDimension(input.thicknessCm, "السمك");
  const tone = parseOptionalText(input.tone, 64, "التون");
  const specGroupKey = parseOptionalText(
    input.specGroupKey,
    128,
    "مفتاح تجميع المواصفات"
  );

  const hasSize = length !== null || width !== null;
  const hasAnySpec = hasSize || tone !== null || thickness !== null;

  if (itemType === "general") {
    if (hasAnySpec) {
      throw new ItemSpecError(
        "الصنف العادي لا يقبل مواصفات المقاس أو التون أو السمك. اختر نوع سيراميك أو رخام أولًا."
      );
    }
    return {
      itemType,
      sizeLengthCm: null,
      sizeWidthCm: null,
      tone: null,
      thicknessCm: null,
      specGroupKey,
    };
  }

  if (length === null || width === null) {
    throw new ItemSpecError(
      itemType === "ceramic"
        ? "مقاس السيراميك يتطلب إدخال الطول والعرض معًا بالسنتيمتر"
        : "مقاس الرخام يتطلب إدخال الطول والعرض معًا بالسنتيمتر"
    );
  }

  if (itemType === "ceramic") {
    if (thickness !== null) {
      throw new ItemSpecError(
        "السمك خاص بالرخام فقط، ولا يمكن إضافته لصنف سيراميك"
      );
    }
    return {
      itemType,
      sizeLengthCm: length.toFixed(2),
      sizeWidthCm: width.toFixed(2),
      tone,
      thicknessCm: null,
      specGroupKey,
    };
  }

  // marble
  if (tone !== null) {
    throw new ItemSpecError(
      "التون خاص بالسيراميك فقط، ولا يمكن إضافته لصنف رخام"
    );
  }
  return {
    itemType,
    sizeLengthCm: length.toFixed(2),
    sizeWidthCm: width.toFixed(2),
    tone: null,
    thicknessCm: thickness === null ? null : thickness.toFixed(2),
    specGroupKey,
  };
}

function formatSpecNumber(value: number | string): string {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return String(Number(parsed.toFixed(2)));
}

/**
 * يعيد وصف المواصفات فقط (بدون اسم الصنف)، مثال:
 *  - سيراميك: "30×60 سم — تون 101"
 *  - رخام:   "130×20 سم — سُمك 2 سم"
 *  - عادي/قديم: null
 */
export function formatItemSpecLabel(
  item: ItemSpecInput | null | undefined
): string | null {
  if (!item) return null;
  const itemType = item.itemType;
  if (itemType !== "ceramic" && itemType !== "marble") return null;

  const parts: string[] = [];
  const length = item.sizeLengthCm;
  const width = item.sizeWidthCm;
  if (
    length !== null &&
    length !== undefined &&
    width !== null &&
    width !== undefined
  ) {
    parts.push(`${formatSpecNumber(length)}×${formatSpecNumber(width)} سم`);
  }
  if (itemType === "ceramic") {
    const tone = typeof item.tone === "string" ? item.tone.trim() : "";
    if (tone) parts.push(`تون ${tone}`);
  } else {
    const thickness = item.thicknessCm;
    if (thickness !== null && thickness !== undefined) {
      parts.push(`سُمك ${formatSpecNumber(thickness)} سم`);
    }
  }
  return parts.length ? parts.join(" — ") : null;
}

/**
 * اسم العرض الكامل للصنف: الاسم الأساسي + المواصفات إن وُجدت.
 * مثال: "سيراميك أبيض — 30×60 سم — تون 101".
 */
export function formatItemDisplayName(
  name: string | null | undefined,
  item: ItemSpecInput | null | undefined
): string {
  const base = (name ?? "").trim();
  const spec = formatItemSpecLabel(item);
  if (!base) return spec ?? "";
  return spec ? `${base} — ${spec}` : base;
}
