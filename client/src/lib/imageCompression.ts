export type ImageContentType = "image/jpeg" | "image/png" | "image/webp";
export type CompressedImage = { dataBase64: string; contentType: ImageContentType; fileName: string; originalSize: number; compressedSize: number };

export function getCompressionDimensions(width: number, height: number, maxDimension = 1600) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * FileReader is unreliable for some large camera blobs on mobile browsers and
 * may emit a misleading "read failed" error after canvas compression. Reading
 * the bytes directly avoids that intermittent failure and works on desktop and
 * mobile browsers alike.
 */
async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

export function resolveImageContentType(file: Pick<File, "type" | "name">): ImageContentType | null {
  if (file.type === "image/jpeg" || file.type === "image/jpg") return "image/jpeg";
  if (file.type === "image/png") return "image/png";
  if (file.type === "image/webp") return "image/webp";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (file.type.startsWith("image/")) return "image/jpeg";
  return null;
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height) throw new Error("empty image");
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => element.naturalWidth && element.naturalHeight ? resolve(element) : reject(new Error("empty image"));
        element.onerror = () => reject(new Error("decode failed"));
        element.src = url;
      });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("تعذر فك ترميز الصورة. أعد التقاطها بالكاميرا أو اختر JPG أو PNG أو WEBP.");
    }
  }
}

export async function compressImageFile(file: File, options: { maxDimension?: number; quality?: number } = {}): Promise<CompressedImage> {
  const originalContentType = resolveImageContentType(file);
  if (!originalContentType) throw new Error("الملف ليس صورة مدعومة. استخدم JPG أو PNG أو WEBP.");
  let decoded: Awaited<ReturnType<typeof decodeImage>>;
  try {
    decoded = await decodeImage(file);
  } catch (decodeError) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const browserSafeOriginal = ["jpg", "jpeg", "png", "webp"].includes(extension ?? "") || ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type);
    if (!browserSafeOriginal || file.size > 5 * 1024 * 1024) throw decodeError;
    return { dataBase64: await blobToDataUrl(file), contentType: originalContentType, fileName: file.name || "image", originalSize: file.size, compressedSize: file.size };
  }
  try {
    const dimensions = getCompressionDimensions(decoded.width, decoded.height, options.maxDimension ?? 1600);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز مساحة ضغط الصورة");
    context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("تعذر ضغط الصورة")), "image/jpeg", options.quality ?? 0.82));
    return { dataBase64: await blobToDataUrl(blob), contentType: "image/jpeg", fileName: `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`, originalSize: file.size, compressedSize: blob.size };
  } finally {
    decoded.close?.();
  }
}

export { decodeImage };
