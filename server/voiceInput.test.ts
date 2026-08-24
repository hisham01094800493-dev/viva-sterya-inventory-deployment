import { describe, expect, it } from "vitest";
import { getSpeechRecognitionConstructor, normalizeVoiceSearchText } from "../client/src/components/VoiceInputButton";

describe("الإدخال الصوتي", () => {
  it("ينظف النص العربي المنسوخ من التعرف الصوتي", () => {
    expect(normalizeVoiceSearchText("  كود 10001،  ")).toBe("كود 10001");
    expect(normalizeVoiceSearchText("اسم الصنف!!!")).toBe("اسم الصنف");
  });

  it("يعيد عدم الدعم بأمان خارج بيئة المتصفح", () => {
    expect(getSpeechRecognitionConstructor()).toBeNull();
  });
});
