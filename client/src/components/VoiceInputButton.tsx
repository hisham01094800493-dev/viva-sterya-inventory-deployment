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

  function toggleListening() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { toast.error("البحث الصوتي غير مدعوم في هذا المتصفح. افتح البرنامج في Google Chrome أو Safari حديثاً."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const recognition = new Recognition();
    recognition.lang = "ar-EG";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => { const text = event.results[0]?.[0]?.transcript?.trim(); if (text) onText(text); };
    recognition.onerror = event => {
      setListening(false);
      const error = event?.error;
      if (error === "not-allowed" || error === "service-not-allowed") toast.error("Chrome يمنع خدمة التعرف الصوتي لهذا الموقع. افتح الرابط مباشرة في Chrome، ثم من إعدادات الموقع اجعل الميكروفون مسموحاً، وأعد تحميل الصفحة.");
      else if (error === "audio-capture") toast.error("لم تصل خدمة التعرف إلى الميكروفون. أغلق أي تطبيق يستخدمه ثم أعد المحاولة.");
      else if (error === "network") toast.error("تعذر الاتصال بخدمة التعرف الصوتي. تحقق من الإنترنت ثم أعد المحاولة.");
      else if (error !== "aborted") toast.error("تعذر التقاط الكلام. تحدث بوضوح وحاول مرة أخرى.");
    };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); } catch { setListening(false); toast.error("تعذر بدء البحث الصوتي. أغلق النافذة وافتحها مرة أخرى."); }
  }
  return <button type="button" onClick={toggleListening} disabled={!supported} aria-pressed={listening} aria-label={listening ? "جارٍ الاستماع، اضغط للإيقاف" : supported ? label : "البحث الصوتي غير مدعوم"} title={listening ? "جارٍ الاستماع، اضغط للإيقاف" : supported ? label : "البحث الصوتي غير مدعوم في هذا المتصفح"} className={`group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 ${listening ? "border-red-300 bg-red-50 text-red-600 shadow-[0_0_0_5px_rgba(239,68,68,0.12)] motion-safe:animate-[voiceButtonPulse_1.4s_ease-in-out_infinite]" : "border-[#dce7ee] bg-white text-[#0d7180] hover:border-[#8bc5c9] hover:bg-[#e8f7f6]"} disabled:cursor-not-allowed disabled:opacity-45 ${className}`}><span aria-hidden="true" className={`pointer-events-none absolute inset-[-4px] rounded-[1rem] border-2 border-red-300/70 ${listening ? "motion-safe:animate-ping motion-reduce:animate-none" : "hidden"}`} />{listening ? <MicOff className="relative z-10 h-4 w-4" /> : <Mic className="relative z-10 h-4 w-4" />}{listening && <span className="sr-only" aria-live="polite">جارٍ الاستماع</span>}</button>;
}

export function normalizeVoiceSearchText(value: string) { return value.trim().replace(/[؟?,،؛;.!]+$/g, "").replace(/\s+/g, " "); }
