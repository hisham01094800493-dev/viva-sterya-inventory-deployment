import { describe, expect, it, vi } from "vitest";
import { uploadItemImage } from "./itemImageUpload";

describe("مسار رفع صورة الصنف", () => {
  it("يرفع الصورة ويحفظ مفتاحها ورابطها على الصنف", async () => {
    const put = vi.fn(async (key: string, data: Buffer, contentType?: string) => {
      expect(key).toBe("items/7/product photo.png");
      expect(data.toString()).toBe("image-bytes");
      expect(contentType).toBe("image/png");
      return { key: "items/7/product_photo_abc.png", url: "/manus-storage/items/7/product_photo_abc.png" };
    });
    const save = vi.fn(async (itemId: number, key: string, url: string) => ({ itemId, key, url }));

    const result = await uploadItemImage({ itemId: 7, fileName: "product photo.png", contentType: "image/png", dataBase64: Buffer.from("image-bytes").toString("base64") }, { put, save });

    expect(result).toEqual({ itemId: 7, key: "items/7/product_photo_abc.png", url: "/manus-storage/items/7/product_photo_abc.png" });
    expect(put).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(7, "items/7/product_photo_abc.png", "/manus-storage/items/7/product_photo_abc.png");
  });
});
