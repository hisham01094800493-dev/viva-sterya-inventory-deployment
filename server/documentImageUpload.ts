import { updateAdditionDocumentImage, updateDisbursementDocumentImage, updateTransferDocumentImage } from "./db";
import { sanitizeUploadedImageFileName } from "./imageFileName";
import { storagePut } from "./storage";

type UploadInput = {
  movementType: "addition" | "disbursement" | "transfer";
  movementId: number;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  dataBase64: string;
};

type UploadDeps = {
  put: typeof storagePut;
  saveAddition: typeof updateAdditionDocumentImage;
  saveDisbursement: typeof updateDisbursementDocumentImage;
  saveTransfer?: typeof updateTransferDocumentImage;
};

export async function uploadDocumentImage(input: UploadInput, deps: UploadDeps = { put: storagePut, saveAddition: updateAdditionDocumentImage, saveDisbursement: updateDisbursementDocumentImage, saveTransfer: updateTransferDocumentImage }) {
  const raw = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error("حجم صورة الإذن يجب ألا يتجاوز 5 ميجابايت");
  const safeName = sanitizeUploadedImageFileName(input.fileName, `permit-${input.movementId}`);
  const uploaded = await deps.put(`movement-documents/${input.movementType}/${input.movementId}/${safeName}`, buffer, input.contentType);
  if (input.movementType === "addition") return deps.saveAddition(input.movementId, uploaded.key, uploaded.url);
  if (input.movementType === "disbursement") return deps.saveDisbursement(input.movementId, uploaded.key, uploaded.url);
  if (!deps.saveTransfer) throw new Error("حفظ صورة حركة المرتجع غير مهيأ");
  return deps.saveTransfer(input.movementId, uploaded.key, uploaded.url);
}

export type { UploadInput as DocumentImageUploadInput };
