import { Mic, MicOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [listening, setListening] = useState(false);
  const transcribe = trpc.voice.transcribe.useMutation();
  const supported = Boolean(getSpeechRecognitionConstructor());
  const recorderSupported = typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  useEffect(() => () => { recognitionRef.current?.stop(); recorderRef.current?.stop(); streamRef.current?.getTracks().forEach(track => track.stop()); }, []);

  async function startRecorderFallback() {
    if (!window.isSecureContext && window.location.hostname !== "localhost") { toast.error("التسجيل الصوتي يحتاج إلى رابط HTTPS مباشر، وليس نافذة داخل تطبيق آخر."); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast.error("هذا المتصفح لا يدعم التسجيل الصوتي. افتح رابط البرنامج مباشرة في Google Chrome."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type)) ?? "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = String(reader.result ?? "");
          const comma = dataUrl.indexOf(",");
          if (comma < 0) { setListening(false); toast.error("تعذر تجهيز التسجيل الصوتي."); return; }
          transcribe.mutate({ audioDataBase64: dataUrl.slice(comma + 1), mimeType, language: "ar" }, { onSuccess: result => { setListening(false); if (result.text?.trim()) onText(result.text.trim()); else toast.error("لم يتم التعرف على كلام واضح."); }, onError: () => { setListening(false); toast.error("تعذر تحويل التسجيل إلى نص. تحقق من الاتصال ثم حاول مرة أخرى."); } });
        };
        reader.readAsDataURL(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
      window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 5000);
      toast.info("تحدث الآن لمدة تصل إلى 5 ثوانٍ…");
    } catch (error) {
      setListening(false);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") toast.error("المتصفح رفض إنشاء جلسة التسجيل. افتح الموقع مباشرة في Chrome، وليس داخل WhatsApp أو Facebook، ثم أعد تحميل الصفحة.");
      else if (name === "NotFoundError") toast.error("لم يتم العثور على ميكروفون متاح في الجهاز.");
      else if (name === "NotReadableError") toast.error("الميكروفون مستخدم من تطبيق آخر. أغلق المكالمات أو التسجيلات ثم حاول.");
      else toast.error("تعذر تسجيل الصوت في هذا المتصفح. جرّب فتح الرابط مباشرة في Chrome.");
    }
  }

  function toggleListening() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { if (recorderSupported) { void startRecorderFallback(); return; } toast.error("البحث الصوتي غير مدعوم في هذا المتصفح. افتح البرنامج مباشرة في Google Chrome."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const recognition = new Recognition();
    recognition.lang = "ar-EG";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => { const text = event.results[0]?.[0]?.transcript?.trim(); if (text) onText(text); };
    recognition.onerror = event => {
      setListening(false);
      const error = event?.error;
      if (error === "not-allowed" || error === "service-not-allowed") { toast.info("سأستخدم التسجيل المباشر بدل خدمة التعرف الصوتي."); recognition.stop(); window.setTimeout(() => void startRecorderFallback(), 350); }
      else if (error === "audio-capture") { toast.info("سأعيد فتح الميكروفون بطريقة التسجيل المباشر."); recognition.stop(); window.setTimeout(() => void startRecorderFallback(), 350); }
      else if (error === "network") toast.error("تعذر الاتصال بخدمة التعرف الصوتي. تحقق من الإنترنت ثم أعد المحاولة.");
      else if (error !== "aborted") toast.error("تعذر التقاط الكلام. تحدث بوضوح وحاول مرة أخرى.");
    };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); } catch { setListening(false); toast.error("تعذر بدء البحث الصوتي. أغلق النافذة وافتحها مرة أخرى."); }
  }
  return <button type="button" onClick={toggleListening} disabled={!supported && !recorderSupported} aria-pressed={listening} aria-label={listening ? "جارٍ الاستماع، اضغط للإيقاف" : supported || recorderSupported ? label : "البحث الصوتي غير مدعوم"} title={listening ? "جارٍ الاستماع، اضغط للإيقاف" : supported || recorderSupported ? label : "البحث الصوتي غير مدعوم في هذا المتصفح"} className={`group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 ${listening ? "border-red-300 bg-red-50 text-red-600 shadow-[0_0_0_5px_rgba(239,68,68,0.12)] motion-safe:animate-[voiceButtonPulse_1.4s_ease-in-out_infinite]" : "border-[#dce7ee] bg-white text-[#0d7180] hover:border-[#8bc5c9] hover:bg-[#e8f7f6]"} disabled:cursor-not-allowed disabled:opacity-45 ${className}`}><span aria-hidden="true" className={`pointer-events-none absolute inset-[-4px] rounded-[1rem] border-2 border-red-300/70 ${listening ? "motion-safe:animate-ping motion-reduce:animate-none" : "hidden"}`} />{listening ? <MicOff className="relative z-10 h-4 w-4" /> : <Mic className="relative z-10 h-4 w-4" />}{listening && <span className="sr-only" aria-live="polite">جارٍ الاستماع</span>}</button>;
}

export function normalizeVoiceSearchText(value: string) { return value.trim().replace(/[؟?,،؛;.!]+$/g, "").replace(/\s+/g, " "); }
