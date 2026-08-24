export function createReportMailtoUrl(title: string, fileName: string) {
  const subject = encodeURIComponent(`Smart Inventory - ${title}`);
  const body = encodeURIComponent(`مرحباً،\n\nأرفقت تقرير ${title} من نظام Smart Inventory.\nاسم الملف المقترح: ${fileName}`);
  return `mailto:?subject=${subject}&body=${body}`;
}

export function createReportWhatsAppUrl(title: string, fileName: string) {
  const text = encodeURIComponent(`تقرير ${title} من نظام Smart Inventory. اسم الملف: ${fileName}`);
  return `https://wa.me/?text=${text}`;
}

export async function shareImageFile(dataUrl: string, title: string, fileName: string): Promise<"shared" | "unsupported" | "cancelled"> {
  const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean }).share;
  if (!share) return "unsupported";
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("تعذر تجهيز صورة الإذن للمشاركة");
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
  const data: ShareData = { title, text: `صورة إذن من Smart Inventory: ${title}`, files: [file] };
  const canShare = (navigator as Navigator & { canShare?: (value: ShareData) => boolean }).canShare;
  if (canShare && !canShare(data)) return "unsupported";
  try {
    await share.call(navigator, data);
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}

export async function shareExcelFile(url: string, title: string, fileName: string): Promise<"shared" | "unsupported" | "cancelled"> {
  const shareNavigator = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
  if (typeof shareNavigator.share !== "function") return "unsupported";
  const response = await fetch(url);
  if (!response.ok) throw new Error("تعذر تجهيز ملف Excel للمشاركة");
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const data: ShareData = { title, text: `تقرير ${title} من Smart Inventory`, files: [file] };
  if (typeof shareNavigator.canShare === "function") {
    try { if (!shareNavigator.canShare(data)) return "unsupported"; } catch { return "unsupported"; }
  }
  try {
    await shareNavigator.share(data);
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    if (error instanceof TypeError || error instanceof DOMException) return "unsupported";
    throw error;
  }
}

export async function sharePdfFile(url: string, title: string, fileName: string): Promise<"shared" | "unsupported" | "cancelled"> {
  const shareNavigator = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
  if (typeof shareNavigator.share !== "function") return "unsupported";
  const response = await fetch(url);
  if (!response.ok) throw new Error("تعذر تجهيز ملف التقرير للمشاركة");
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: "application/pdf" });
  const data: ShareData = { title, text: `تقرير ${title} من Smart Inventory`, files: [file] };
  if (typeof shareNavigator.canShare === "function") {
    try {
      if (!shareNavigator.canShare(data)) return "unsupported";
    } catch {
      return "unsupported";
    }
  }
  try {
    // Call through navigator directly; some browsers reject an extracted share method with Illegal Invocation.
    await shareNavigator.share(data);
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    if (error instanceof TypeError || error instanceof DOMException) return "unsupported";
    throw error;
  }
}
