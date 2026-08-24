import type { NotificationTone } from "@/lib/notificationCenter";

let audioContext: AudioContext | null = null;

export const notificationSoundPresets = {
  soft: { label: "هادئة", frequency: 440, duration: 0.16 },
  double: { label: "مزدوجة", frequency: 620, duration: 0.2 },
  alert: { label: "تنبيه واضح", frequency: 780, duration: 0.28 },
  strong: { label: "قوية وعالية", frequency: 920, duration: 0.34 },
} as const;

export type NotificationSoundId = keyof typeof notificationSoundPresets;
const soundPreferenceKey = "smart-inventory-notification-tone";
const volumePreferenceKey = "smart-inventory-notification-volume";

export function getNotificationSoundPreference(): NotificationSoundId {
  if (typeof window === "undefined") return "strong";
  const value = window.localStorage.getItem(soundPreferenceKey) as NotificationSoundId | null;
  return value && value in notificationSoundPresets ? value : "strong";
}

export function setNotificationSoundPreference(value: NotificationSoundId) {
  if (typeof window !== "undefined") window.localStorage.setItem(soundPreferenceKey, value);
}

export function getNotificationVolume() {
  if (typeof window === "undefined") return 1;
  const value = Number(window.localStorage.getItem(volumePreferenceKey));
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

export function setNotificationVolume(value: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(volumePreferenceKey, String(Math.min(1, Math.max(0, value))));
}

type WindowWithAudio = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function getAudioContextConstructor() {
  if (typeof window === "undefined") return undefined;
  const audioWindow = window as WindowWithAudio;
  return window.AudioContext || audioWindow.webkitAudioContext;
}

export function enableNotificationAudioPreference() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("smart-inventory-notification-sound", "on");
  if (!window.localStorage.getItem("smart-inventory-audio-preferences-v2")) {
    window.localStorage.setItem(soundPreferenceKey, "strong");
    window.localStorage.setItem(volumePreferenceKey, "1");
    window.localStorage.setItem("smart-inventory-audio-preferences-v2", "true");
  }
}

export function unlockNotificationAudio() {
  const AudioContextClass = getAudioContextConstructor();
  if (!AudioContextClass) return false;
  try {
    audioContext ??= new AudioContextClass();
    if (audioContext.state === "suspended") void audioContext.resume();
    return true;
  } catch {
    return false;
  }
}

export async function playNotificationTone(tone: NotificationTone) {
  const AudioContextClass = getAudioContextConstructor();
  if (!AudioContextClass) return false;
  try {
    audioContext ??= new AudioContextClass();
    if (audioContext.state === "suspended") await audioContext.resume();
    if (audioContext.state !== "running") return false;
    const context = audioContext;
    const selected = notificationSoundPresets[getNotificationSoundPreference()];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const frequency = selected.frequency;
    const duration = selected.duration;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.16 * getNotificationVolume(), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    return true;
  } catch {
    return false;
  }
}

export function resetNotificationAudioForTests() {
  audioContext = null;
}
