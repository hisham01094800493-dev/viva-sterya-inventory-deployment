export type ImageContentType = "image/jpeg" | "image/png" | "image/webp";
export type CompressedImage = { dataBase64: string; contentType: ImageContentType; fileName: string; originalSize: number; compressedSize: number };

export function getCompressionDimensions(width: number, height: number, maxDimension = 1600) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة المضغوطة"));
    reader.readAsDataURL(blob);
  });
}

export function resolveImageContentType(file: Pick<File, "type" | "name">): ImageContentType | null {
  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("تعذر فك ترميز الصورة. استخدم JPG أو PNG أو WEBP."));
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
    if (file.size > 5 * 1024 * 1024) throw decodeError;
    return { dataBase64: await blobToDataUrl(file), contentType: originalContentType, fileName: file.name || "permit-image", originalSize: file.size, compressedSize: file.size };
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
