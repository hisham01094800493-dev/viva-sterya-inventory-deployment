export const ITEM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ITEM_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;

export function validateItemImage(file: { type: string; size: number }) {
  if (!file.type.startsWith("image/")) return "اختر ملف صورة بصيغة صحيحة";
  if (file.size > ITEM_IMAGE_MAX_BYTES) return "حجم الصورة يجب ألا يتجاوز 5 ميجابايت";
  return null;
}
