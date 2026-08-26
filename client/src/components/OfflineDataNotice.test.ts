import { describe, expect, it } from "vitest";
import { getOfflineDataNoticeMessage } from "./OfflineDataNotice";

describe("رسالة البيانات المحلية دون اتصال", () => {
  it("explains when a saved local copy is being shown", () => {
    expect(getOfflineDataNoticeMessage("تقارير المخزون", true)).toContain("آخر نسخة محفوظة");
  });

  it("explains how to prepare a screen that has no saved copy", () => {
    expect(getOfflineDataNoticeMessage("الموردين", false)).toContain("اتصل بالإنترنت");
  });
});
