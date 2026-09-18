import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type RecognitionResult = { 0: { transcript: string } };
type RecognitionEventLike = { results: ArrayLike<RecognitionResult> };
type RecognitionLike = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((event: RecognitionEventLike) => void) | null; onerror: ((event?: { error?: string }) => void) | null; onend: (() => void) | null };
type RecognitionConstructor = new () => RecognitionLike;

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function VoiceInputButton({ onText, label = "البحث بالصوت", className = "" }: { onText: (text: string) => void; label?: string; className?: string }) {
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const supported = Boolean(getSpeechRecognitionConstructor());

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  async function toggleListening() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { toast.error("البحث الصوتي غير مدعوم في هذا المتصفح. استخدم Chrome أو Safari حديثاً."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
      toast.error("البحث الصوتي يحتاج إلى فتح الموقع عبر HTTPS. افتح رابط Railway أو Render الآمن.");
      return;
    }
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") toast.error("تم رفض إذن الميكروفون. اسمح للمتصفح باستخدام الميكروفون من رمز القفل بجوار الرابط، ثم أعد المحاولة.");
      else toast.error("تعذر الوصول إلى الميكروفون. تأكد أنه غير مستخدم في تطبيق آخر ثم حاول مرة أخرى.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ar-EG";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => { const text = event.results[0]?.[0]?.transcript?.trim(); if (text) onText(text); };
    recognition.onerror = event => { setListening(false); const error = event?.error; if (error === "not-allowed" || error === "service-not-allowed") toast.error("تم رفض إذن الميكروفون. اسمح به من إعدادات الموقع ثم اضغط على الميكروفون مرة أخرى."); else if (error !== "aborted") toast.error("تعذر التقاط الصوت. تحدث بوضوح وحاول مرة أخرى."); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); } catch { setListening(false); toast.error("تعذر بدء البحث الصوتي. أعد فتح النافذة وحاول مرة أخرى."); }
  }

  return <button type="button" onClick={toggleListening} disabled={!supported} aria-pressed={listening} aria-label={listening ? "جارٍ الاستماع، اضغط للإيقاف" : supported ? label : "البحث الصوتي غير مدعوم"} title={listening ? "جارٍ الاستماع، اضغط للإيقاف" : supported ? label : "البحث الصوتي غير مدعوم في هذا المتصفح"} className={`group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 ${listening ? "border-red-300 bg-red-50 text-red-600 shadow-[0_0_0_5px_rgba(239,68,68,0.12)] motion-safe:animate-[voiceButtonPulse_1.4s_ease-in-out_infinite]" : "border-[#dce7ee] bg-white text-[#0d7180] hover:border-[#8bc5c9] hover:bg-[#e8f7f6]"} disabled:cursor-not-allowed disabled:opacity-45 ${className}`}><span aria-hidden="true" className={`pointer-events-none absolute inset-[-4px] rounded-[1rem] border-2 border-red-300/70 ${listening ? "motion-safe:animate-ping motion-reduce:animate-none" : "hidden"}`} />{listening ? <MicOff className="relative z-10 h-4 w-4" /> : <Mic className="relative z-10 h-4 w-4" />}{listening && <span className="sr-only" aria-live="polite">جارٍ الاستماع</span>}</button>;
}

export function normalizeVoiceSearchText(value: string) { return value.trim().replace(/[؟?,،؛;.!]+$/g, "").replace(/\s+/g, " "); }
