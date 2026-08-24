import { describe, expect, it, vi } from "vitest";
import { uploadDocumentImage } from "./documentImageUpload";

describe("صور أذونات الحركات", () => {
  it("يرفع صورة إذن الإضافة ويحفظها في سجل الإضافة", async () => {
    const saveAddition = vi.fn().mockResolvedValue({ id: 12 });
    const saveDisbursement = vi.fn();
    const put = vi.fn().mockResolvedValue({ key: "movement-documents/addition/12/permit.png", url: "https://cdn.test/permit.png" });
    const result = await uploadDocumentImage({ movementType: "addition", movementId: 12, fileName: "permit.png", contentType: "image/png", dataBase64: Buffer.from("paper").toString("base64") }, { put, saveAddition, saveDisbursement });
    expect(put).toHaveBeenCalledWith("movement-documents/addition/12/permit.png", expect.any(Buffer), "image/png");
    expect(saveAddition).toHaveBeenCalledWith(12, "movement-documents/addition/12/permit.png", "https://cdn.test/permit.png");
    expect(saveDisbursement).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 12 });
  });

  it("يرفع صورة إذن المرتجع ويحفظها في سجل التحويلات", async () => {
    const saveTransfer = vi.fn().mockResolvedValue({ id: 18 });
    const put = vi.fn().mockResolvedValue({ key: "movement-documents/transfer/18/return.png", url: "https://cdn.test/return.png" });
    const result = await uploadDocumentImage({ movementType: "transfer", movementId: 18, fileName: "return.png", contentType: "image/png", dataBase64: Buffer.from("return-paper").toString("base64") }, { put, saveAddition: vi.fn(), saveDisbursement: vi.fn(), saveTransfer });
    expect(put).toHaveBeenCalledWith("movement-documents/transfer/18/return.png", expect.any(Buffer), "image/png");
    expect(saveTransfer).toHaveBeenCalledWith(18, "movement-documents/transfer/18/return.png", "https://cdn.test/return.png");
    expect(result).toEqual({ id: 18 });
  });

  it("يرفض صورة الإذن الأكبر من الحد المسموح", async () => {
    await expect(uploadDocumentImage({ movementType: "disbursement", movementId: 9, fileName: "permit.jpg", contentType: "image/jpeg", dataBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64") }, { put: vi.fn(), saveAddition: vi.fn(), saveDisbursement: vi.fn() })).rejects.toThrow("5 ميجابايت");
  });
});
