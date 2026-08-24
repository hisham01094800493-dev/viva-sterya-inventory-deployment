import { describe, expect, it } from "vitest";
import { getNotificationTone } from "../client/src/lib/notificationCenter";
import { playNotificationTone, resetNotificationAudioForTests, unlockNotificationAudio } from "../client/src/lib/notificationAudio";

describe("صوت الإشعارات", () => {
  it("uses stronger tones for critical notifications", () => {
    expect(getNotificationTone("critical").frequency).toBeGreaterThan(getNotificationTone("normal").frequency);
    expect(getNotificationTone("critical").duration).toBeGreaterThan(getNotificationTone("normal").duration);
  });

  it("fails safely when audio is unavailable outside a browser", async () => {
    resetNotificationAudioForTests();
    expect(unlockNotificationAudio()).toBe(false);
    await expect(playNotificationTone(getNotificationTone("normal"))).resolves.toBe(false);
  });
});
