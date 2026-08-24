export function createDescriptiveImageFileName(label: string, sourceFileName: string, fallback: string) {
  const extension = (sourceFileName.match(/\.([a-z0-9]+)$/i)?.[1] || "jpg").toLowerCase();
  const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
  const normalizedLabel = label.trim().normalize("NFKC").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").replace(/^\.+|\.+$/g, "").slice(0, 96);
  return `${normalizedLabel || fallback}.${safeExtension}`;
}
