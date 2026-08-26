import { describe, expect, it } from "vitest";
import { resolveImageContentType } from "./imageCompression";

describe("صيغ صورة الإذن", () => {
  it("accepts camera files whose mime type is missing when their JPG extension is valid", () => {
    expect(resolveImageContentType({ name: "permit.jpg", type: "" } as File)).toBe("image/jpeg");
  });

  it("keeps supported PNG and WEBP files in their original format during fallback", () => {
    expect(resolveImageContentType({ name: "permit.png", type: "image/png" } as File)).toBe("image/png");
    expect(resolveImageContentType({ name: "permit.webp", type: "image/webp" } as File)).toBe("image/webp");
  });
});
