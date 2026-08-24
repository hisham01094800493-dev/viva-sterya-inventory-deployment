import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, AudioLines, FileText, Home, Image as ImageIcon, MessageCircle, Mic, Paperclip, Plus, Send, Shield, Square, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

type AttachmentMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/mpeg";
type PendingAttachment = { dataBase64: string; name: string; mime: AttachmentMime; size: number };

const allowedMime: AttachmentMime[] = ["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"];
const recordingMimeCandidates = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/mpeg", "audio/ogg;codecs=opus", "audio/ogg", "audio/webm;codecs=opus", "audio/webm"];
function audioExtension(mime: string) { return mime === "audio/mp4" ? "mp4" : mime === "audio/mpeg" ? "mp3" : mime === "audio/ogg" ? "ogg" : "webm"; }

function AudioAttachment({ src }: { src: string }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-xl bg-black/10 px-3 py-2" dir="rtl"><AudioLines className="h-5 w-5 shrink-0" /><span className="shrink-0 text-xs font-black">رسالة صوتية</span><audio controls preload="metadata" src={src} className="h-9 min-w-0 flex-1" aria-label="تشغيل الرسالة الصوتية" /></div>;
}

function AudioPreview({ src, onRemove, onRedo }: { src: string; onRemove: () => void; onRedo: () => void }) {
  return <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-xl border border-[#b9d4d9] bg-[#f4fafb] px-3 py-2 text-xs font-bold text-[#0d4f62]" dir="rtl"><AudioAttachment src={src} /><div className="mr-auto flex items-center gap-1"><Button type="button" size="sm" variant="ghost" onClick={onRedo} className="text-[#0d7180]" title="إعادة التسجيل">إعادة التسجيل</Button><Button type="button" size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8 text-slate-400 hover:text-red-600" title="حذف التسجيل" aria-label="حذف التسجيل"><X className="h-4 w-4" /></Button></div></div>;
}

export default function ChatPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const conversations = trpc.chat.conversations.useQuery(undefined, { refetchInterval: 15000 });
  const users = trpc.chat.users.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const rows = conversations.data ?? [];
  const selected = rows.find(row => row.id === selectedId) ?? rows[0];
  const conversationId = selected?.id ?? 0;
  const messages = trpc.chat.messages.useQuery({ conversationId }, { enabled: Boolean(conversationId), refetchInterval: 10000 });
  const send = trpc.chat.send.useMutation({ onSuccess: async () => { setBody(""); setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ""; await Promise.all([messages.refetch(), conversations.refetch()]); }, onError: error => toast.error(error.message || "تعذر إرسال الرسالة") });
  const createPrivate = trpc.chat.createPrivate.useMutation({ onSuccess: async result => { setShowNew(false); setParticipantId(""); await conversations.refetch(); setSelectedId(result.id); toast.success("تم إنشاء المحادثة الخاصة"); }, onError: error => toast.error(error.message || "تعذر إنشاء المحادثة") });
  const markRead = trpc.chat.markRead.useMutation();
  const deleteMessage = trpc.chat.deleteMessage.useMutation({ onSuccess: () => void messages.refetch(), onError: error => toast.error(error.message || "تعذر حذف الرسالة") });
  const cleanupOldMessages = trpc.chat.cleanupOldMessages.useMutation({ onSuccess: async result => { await Promise.all([messages.refetch(), conversations.refetch()]); toast.success(result.deletedMessages ? `تم حذف ${result.deletedMessages} رسالة أقدم من 30 يومًا` : "لا توجد رسائل أقدم من 30 يومًا"); }, onError: error => toast.error(error.message || "تعذر تنظيف الرسائل القديمة") });
  const deleteAllMessages = trpc.chat.deleteAllMessages.useMutation({ onSuccess: async result => { await Promise.all([messages.refetch(), conversations.refetch()]); toast.success(result.deletedMessages ? `تم حذف ${result.deletedMessages} رسالة نهائيًا` : "لا توجد رسائل للحذف"); }, onError: error => toast.error(error.message || "تعذر حذف رسائل الشات") });
  useEffect(() => { if (selected?.id) { setSelectedId(current => current ?? selected.id); markRead.mutate({ conversationId: selected.id }); } }, [selected?.id]);
  const unread = useMemo(() => rows.reduce((sum, row) => sum + Number(row.unreadCount ?? 0), 0), [rows]);
  const selectedMessages = messages.data ?? [];

  const chooseAttachment = (file: File | undefined) => {
    if (!file) return;
    if (!allowedMime.includes(file.type as AttachmentMime)) { toast.error("يسمح بإرفاق صور أو ملفات PDF أو تسجيلات صوتية فقط"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("حجم المرفق يجب ألا يتجاوز 8 ميجابايت"); return; }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ dataBase64: String(reader.result), name: file.name, mime: file.type as AttachmentMime, size: file.size });
    reader.onerror = () => toast.error("تعذر قراءة الملف");
    reader.readAsDataURL(file);
  };
  const startVoiceRecording = async () => {
    if (isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast.error("المتصفح لا يدعم تسجيل الصوت"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedType = recordingMimeCandidates.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size > 0) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (recordingTimerRef.current !== null) { window.clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
        setIsRecording(false);
        recorderRef.current = null;
        const blobMime = (recorder.mimeType || supportedType || "audio/webm").split(";")[0] as AttachmentMime;
        const blob = new Blob(recordingChunksRef.current, { type: blobMime });
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        const mime = (blob.type.split(";")[0] || blobMime || "audio/webm") as AttachmentMime;
        if (blob.size > 8 * 1024 * 1024) { toast.error("حجم التسجيل الصوتي تجاوز 8 ميجابايت"); return; }
        const reader = new FileReader();
        reader.onload = () => setAttachment({ dataBase64: String(reader.result), name: `رسالة صوتية-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${audioExtension(mime)}`, mime, size: blob.size });
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds(seconds => { if (seconds >= 119) { recorder.stop(); return 120; } return seconds + 1; }), 1000);
    } catch { toast.error("تعذر الوصول إلى الميكروفون. تحقق من إذن التسجيل في المتصفح."); }
  };
  const stopVoiceRecording = () => {
    if (recordingTimerRef.current !== null) { window.clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    setIsRecording(false);
  };
  useEffect(() => () => { if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current); recordingStreamRef.current?.getTracks().forEach(track => track.stop()); }, []);
  const handleDrop = (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsDragging(false);
    chooseAttachment(event.dataTransfer.files?.[0]);
  };

  return <div className="mx-auto w-full max-w-6xl space-y-5" dir="rtl">
    <div className="flex flex-col gap-3"><div><p className="text-xs font-black tracking-[0.18em] text-[#0d7180]">SMART CHAT</p><h1 className="mt-1 text-3xl font-black text-[#102a43]">محادثات فريق العمل</h1><p className="mt-1 text-sm text-slate-500">شات عام ومحادثات خاصة آمنة داخل النظام.</p></div><div className="flex w-full flex-wrap items-center justify-start gap-2"><Button type="button" variant="outline" onClick={() => setLocation("/")} className="gap-2 rounded-xl border-[#b9d4d9] bg-white text-[#0d4f62] hover:bg-[#e8f7f6]" title="العودة إلى لوحة التحكم"><Home className="h-4 w-4" /><span>العودة إلى لوحة التحكم</span><ArrowRight className="h-4 w-4" /></Button><Badge className="bg-[#e8f7f6] text-[#0d7180] hover:bg-[#e8f7f6]">{unread} غير مقروءة</Badge><Button type="button" onClick={() => setShowNew(value => !value)} className="gap-2 bg-[#0d7180] text-white hover:bg-[#0d5e6c]"><Plus className="h-4 w-4" />محادثة خاصة</Button></div></div>
    {showNew && <Card className="border-[#b9d4d9] bg-white/90 shadow-sm"><CardContent className="flex flex-wrap items-end gap-3 p-4"><div className="min-w-[240px] flex-1"><label className="mb-2 block text-xs font-black text-[#102a43]">اختر المستخدم</label><select value={participantId} onChange={event => setParticipantId(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">اختر مستخدماً لبدء محادثة خاصة</option>{(users.data ?? []).map(item => <option key={item.id} value={item.id}>{item.name || item.email || `مستخدم ${item.id}`}</option>)}</select></div><Button type="button" disabled={!participantId || createPrivate.isPending} onClick={() => createPrivate.mutate({ participantUserIds: [Number(participantId)] })}>بدء المحادثة</Button></CardContent></Card>}
    <div className="grid min-h-[560px] gap-5 lg:grid-cols-[280px_1fr]">
      <Card className="border-0 bg-white/85 shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><CardContent className="p-0"><div className="border-b border-[#edf2f5] bg-[#f4fafb] p-4"><div className="flex items-center gap-2 font-black text-[#102a43]"><MessageCircle className="h-5 w-5 text-[#0d7180]" />محادثات فريق العمل</div></div><div className="max-h-[520px] overflow-y-auto">{conversations.isLoading ? <p className="p-5 text-sm text-slate-400">جاري تحميل المحادثات...</p> : rows.map(row => <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); markRead.mutate({ conversationId: row.id }); }} className={`w-full border-b border-slate-100 px-4 py-4 text-right hover:bg-[#f7fbfc] ${selected?.id === row.id ? "bg-[#e8f7f6]" : "bg-white"}`}><div className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="flex items-center gap-2 font-black text-[#102a43]">{row.type === "general" ? <Users className="h-4 w-4 text-[#0d7180]" /> : <MessageCircle className="h-4 w-4 text-[#0d7180]" />}{row.title}</span><span className="mt-1 block text-[11px] text-slate-400">{row.type === "general" ? "لكل المستخدمين" : "محادثة خاصة"}</span></span>{Number(row.unreadCount) > 0 && <Badge className="bg-[#bd5147] text-white hover:bg-[#bd5147]">{row.unreadCount}</Badge>}</div></button>)}</div></CardContent></Card>
      <Card className="flex min-h-[560px] flex-col border-0 bg-white/90 shadow-[0_10px_30px_rgba(18,44,84,0.055)]"><div className="flex items-center justify-between border-b border-[#edf2f5] bg-[#f4fafb] p-4"><div><h2 className="font-black text-[#102a43]">{selected?.title ?? "المحادثة العامة"}</h2><p className="mt-1 text-xs text-slate-400">{selected?.type === "private" ? "محادثة خاصة بين المستخدمين" : "رسائل يراها المستخدمون المصرح لهم"}</p></div>{user?.role === "admin" && <div className="flex flex-wrap items-center justify-end gap-2"><div className="flex items-center gap-1 text-xs font-black text-[#0d7180]"><Shield className="h-4 w-4" />إدارة المدير</div><Button type="button" size="sm" variant="outline" disabled={cleanupOldMessages.isPending || deleteAllMessages.isPending} onClick={() => { if (window.confirm("سيتم حذف جميع رسائل محادثات فريق العمل الأقدم من 30 يومًا مع إيصالاتها. هل تريد المتابعة؟")) cleanupOldMessages.mutate(); }} className="gap-1 border-red-200 text-red-700 hover:bg-red-50" title="حذف الرسائل الأقدم من 30 يومًا"><Trash2 className="h-3.5 w-3.5" />{cleanupOldMessages.isPending ? "جارٍ التنظيف..." : "تنظيف الأقدم من 30 يومًا"}</Button><Button type="button" size="sm" variant="outline" disabled={cleanupOldMessages.isPending || deleteAllMessages.isPending} onClick={() => { if (window.confirm("تحذير نهائي: سيتم حذف جميع رسائل محادثات فريق العمل الحالية، النصية والصوتية والصور وملفات PDF وإيصالاتها نهائيًا، ولا يمكن التراجع. هل تريد المتابعة؟")) deleteAllMessages.mutate(); }} className="gap-1 border-red-400 bg-red-50 text-red-800 hover:bg-red-100" title="حذف كل رسائل الشات الآن"><Trash2 className="h-3.5 w-3.5" />{deleteAllMessages.isPending ? "جارٍ الحذف النهائي..." : "حذف كل الشات الآن"}</Button></div>}</div><div className="flex-1 space-y-3 overflow-y-auto p-5">{messages.isLoading ? <p className="text-center text-sm text-slate-400">جاري تحميل الرسائل...</p> : !selectedMessages.length ? <div className="flex min-h-[350px] flex-col items-center justify-center text-center text-slate-400"><MessageCircle className="mb-3 h-10 w-10 text-[#b9d4d9]" /><p className="font-black">لا توجد رسائل بعد</p><p className="mt-1 text-xs">ابدأ المحادثة برسالة قصيرة أو أرفق مستنداً.</p></div> : selectedMessages.map(row => <div key={row.message.id} className={`group flex items-start gap-3 ${row.message.senderId === user?.id ? "flex-row-reverse" : ""}`}><div className="flex-1"><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${row.message.senderId === user?.id ? "mr-auto bg-[#0d7180] text-white" : "bg-[#f1f6f7] text-[#102a43]"}`}><div className="chat-message-meta mb-1 flex items-center justify-between gap-3 text-[10px] font-black"><span>{row.senderName || row.senderEmail || `مستخدم ${row.message.senderId}`}</span><span className="chat-message-time" dir="ltr">{new Date(row.message.createdAt).toLocaleString("ar-EG")}</span></div>{row.message.attachmentUrl && <div className="mb-2">{row.message.attachmentMime?.startsWith("audio/") ? <div className="audio-message-shell"><AudioAttachment src={row.message.attachmentUrl} /></div> : row.message.attachmentMime?.startsWith("image/") ? <a href={row.message.attachmentUrl} target="_blank" rel="noreferrer"><img src={row.message.attachmentUrl} alt={row.message.attachmentName || "صورة مرفقة"} className="max-h-56 max-w-full rounded-xl object-contain" /></a> : <a href={row.message.attachmentUrl} target="_blank" rel="noreferrer" download className="chat-attachment-link flex items-center gap-2 rounded-xl bg-black/10 px-3 py-2 text-sm font-black hover:bg-black/20"><FileText className="h-5 w-5" />{row.message.attachmentName || "ملف PDF"}</a>}</div>}<p className="whitespace-pre-wrap text-sm leading-6">{row.message.body}</p>{row.message.senderId === user?.id && row.receipt && <div className="mt-2 flex items-center justify-end gap-1 text-[10px] font-black text-white/75" title={row.receipt.readCount > 0 ? "تم عرض الرسالة من أحد المستلمين" : row.receipt.deliveredCount > 0 ? "تم استلام الرسالة" : "جاري إرسال الرسالة"}><span className="tracking-[-0.15em]">{row.receipt.readCount > 0 ? "✓✓" : row.receipt.deliveredCount > 0 ? "✓" : "…"}</span><span>{row.receipt.readCount > 0 ? "تم العرض" : row.receipt.deliveredCount > 0 ? "تم الاستلام" : "جاري الإرسال"}</span></div>}</div></div>{user?.role === "admin" && !row.message.isDeleted && <button type="button" title="حذف الرسالة" onClick={() => { if (window.confirm("حذف هذه الرسالة؟")) deleteMessage.mutate({ messageId: row.message.id }); }} className="mt-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}</div>)}</div><form onSubmit={event => { event.preventDefault(); if (conversationId && (body.trim() || attachment)) send.mutate({ conversationId, body: body.trim(), attachment: attachment ?? undefined }); }} onDragOver={event => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} className={`relative space-y-2 border-t border-[#edf2f5] p-4 transition-colors ${isDragging ? "bg-[#e8f7f6]" : "bg-white"}`}>{isDragging && <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-[#0d7180] bg-[#e8f7f6]/95 text-sm font-black text-[#0d4f62]">أفلت الصورة أو ملف PDF هنا</div>}<div className="flex flex-wrap items-end gap-3"><Textarea value={body} onChange={event => setBody(event.target.value)} placeholder="اكتب رسالتك هنا..." rows={2} className="resize-none" maxLength={5000} />{isRecording && <div className="order-3 flex min-w-0 basis-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 sm:order-none sm:basis-auto"><Mic className="h-4 w-4" /><span className="shrink-0 tabular-nums">{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</span><span className="truncate">جارٍ التسجيل</span></div>}<input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,audio/*" className="hidden" onChange={event => chooseAttachment(event.target.files?.[0])} /><Button type="button" variant="outline" title="إرفاق صورة أو PDF" onClick={() => fileInputRef.current?.click()} className="h-11 shrink-0"><Paperclip className="h-4 w-4" /><span className="sr-only">إرفاق صورة أو PDF</span></Button><Button type="button" variant={isRecording ? "destructive" : "outline"} title={isRecording ? "إيقاف التسجيل" : "تسجيل رسالة صوتية"} onClick={isRecording ? stopVoiceRecording : startVoiceRecording} className="h-11 shrink-0 gap-2">{isRecording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}<span className="hidden sm:inline">{isRecording ? `إيقاف ${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}` : "تسجيل صوت"}</span></Button><Button type="submit" disabled={(!body.trim() && !attachment) || send.isPending} className="h-11 gap-2 bg-[#0d7180] text-white hover:bg-[#0d5e6c]"><Send className="h-4 w-4" />إرسال</Button></div>{attachment && (attachment.mime.startsWith("audio/") ? <AudioPreview src={attachment.dataBase64} onRedo={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ""; void startVoiceRecording(); }} onRemove={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} /> : <div className="flex items-center justify-between gap-3 rounded-xl border border-[#b9d4d9] bg-[#f4fafb] px-3 py-2 text-xs font-bold text-[#0d4f62]"><span className="flex min-w-0 items-center gap-2 truncate">{attachment.mime.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}{attachment.name} <span className="text-slate-400">({(attachment.size / 1024 / 1024).toFixed(2)} MB)</span></span><button type="button" onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-red-600" title="إزالة المرفق"><X className="h-4 w-4" /></button></div>)}</form></Card>
    </div>
  </div>;
}
