import { updateItemImage } from "./db";
import { sanitizeUploadedImageFileName } from "./imageFileName";
import { storagePut } from "./storage";

type UploadInput = {
  itemId: number;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  dataBase64: string;
};

type UploadDeps = {
  put: typeof storagePut;
  save: typeof updateItemImage;
};

export async function uploadItemImage(input: UploadInput, deps: UploadDeps = { put: storagePut, save: updateItemImage }) {
  const raw = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 5 ميجابايت");
  const safeName = sanitizeUploadedImageFileName(input.fileName, `item-${input.itemId}`);
  const uploaded = await deps.put(`items/${input.itemId}/${safeName}`, buffer, input.contentType);
  return deps.save(input.itemId, uploaded.key, uploaded.url);
}
