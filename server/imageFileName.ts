export function sanitizeUploadedImageFileName(fileName: string, fallback: string) {
  const extension = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] || "jpg").toLowerCase();
  const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
  const baseName = fileName.replace(/\.[a-z0-9]+$/i, "").normalize("NFKC").replace(/[^a-zA-Z0-9\u0600-\u06FF._ -]/g, "_").replace(/\s+/g, " ").replace(/^\.+|\.+$/g, "").slice(0, 96);
  return `${baseName || fallback}.${safeExtension}`;
}
