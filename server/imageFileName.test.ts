import { describe, expect, it } from "vitest";
import { createDescriptiveImageFileName } from "../client/src/lib/uploadFileName";
import { sanitizeUploadedImageFileName } from "./imageFileName";

describe("تسمية صور المخزون", () => {
  it("يسمي صورة الإذن برقم الإذن نفسه مع امتداد الصورة", () => {
    expect(createDescriptiveImageFileName("512", "camera.webp", "permit-9")).toBe("512.webp");
    expect(sanitizeUploadedImageFileName("512.webp", "permit-9")).toBe("512.webp");
  });

  it("يحافظ على اسم الصنف العربي وينظف المحارف غير الآمنة", () => {
    expect(createDescriptiveImageFileName("حديد تسليح 22 مم", "image.png", "item-3")).toBe("حديد تسليح 22 مم.png");
    expect(sanitizeUploadedImageFileName("حديد/تسليح 22 مم.png", "item-3")).toBe("حديد_تسليح 22 مم.png");
  });
});
