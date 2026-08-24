export type DownloadRuntime = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  click: (url: string, filename: string) => void;
};

const browserDownloadRuntime: DownloadRuntime = {
  createObjectURL: blob => URL.createObjectURL(blob),
  revokeObjectURL: url => URL.revokeObjectURL(url),
  click: (url, filename) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  },
};

export function downloadBlobFile(blob: Blob, filename: string, runtime: DownloadRuntime = browserDownloadRuntime) {
  const url = runtime.createObjectURL(blob);
  runtime.click(url, filename);
  runtime.revokeObjectURL(url);
  return filename;
}

export function savePdfFile(doc: { save: (filename: string) => void }, filename: string) {
  doc.save(filename);
  return filename;
}

export function getExportImageExtension(contentType: string, sourceUrl: string) {
  if (contentType === "image/png" || sourceUrl.toLowerCase().includes(".png")) return "png" as const;
  if (contentType === "image/webp" || sourceUrl.toLowerCase().includes(".webp")) return "webp" as const;
  return "jpeg" as const;
}
