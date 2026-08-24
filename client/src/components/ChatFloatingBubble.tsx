import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { playNotificationTone, unlockNotificationAudio } from "@/lib/notificationAudio";

type Position = { right: number; bottom: number };
const positionKey = "smart-inventory-chat-bubble-position";

function readSavedPosition(): Position | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(positionKey) || "null") as Position | null;
    return value && Number.isFinite(value.right) && Number.isFinite(value.bottom) ? value : null;
  } catch { return null; }
}

export default function ChatFloatingBubble() {
  const [, setLocation] = useLocation();
  const conversations = trpc.chat.conversations.useQuery(undefined, { refetchInterval: 15000 });
  const previousUnread = useRef<number | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; right: number; bottom: number } | null>(null);
  const draggedRef = useRef(false);
  const [position, setPosition] = useState<Position | null>(() => typeof window === "undefined" ? null : readSavedPosition());
  const [isIdle, setIsIdle] = useState(false);
  const [preview, setPreview] = useState<{ title: string; sender: string; text: string } | null>(null);
  const rows = conversations.data ?? [];
  const unreadCount = rows.reduce((total, row) => total + Number(row.unreadCount ?? 0), 0);

  const wakeBubble = () => {
    setIsIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIsIdle(true), 4500);
  };

  useEffect(() => {
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    wakeBubble();
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, []);

  useEffect(() => {
    if (previousUnread.current !== null && unreadCount > previousUnread.current) {
      wakeBubble();
      void playNotificationTone({ frequency: 560, duration: 0.18 });
      const candidate = [...rows].filter(row => Number(row.unreadCount ?? 0) > 0 && row.latestMessage).sort((a, b) => Number(b.latestMessage?.id ?? 0) - Number(a.latestMessage?.id ?? 0))[0];
      if (candidate?.latestMessage) {
        const latest = candidate.latestMessage;
        setPreview({ title: candidate.title, sender: latest.senderName || "رسالة جديدة", text: latest.attachmentName ? `مرفق: ${latest.attachmentName}` : (latest.body || "رسالة جديدة").slice(0, 100) });
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        dismissTimer.current = setTimeout(() => setPreview(null), 6500);
      }
    }
    previousUnread.current = unreadCount;
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [unreadCount, rows]);

  const openChat = () => { if (draggedRef.current) { draggedRef.current = false; return; } setPreview(null); setLocation("/chat"); };
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => { wakeBubble(); unlockNotificationAudio(); dragRef.current = { startX: event.clientX, startY: event.clientY, right: position?.right ?? 16, bottom: position?.bottom ?? 96 }; draggedRef.current = false; event.currentTarget.setPointerCapture(event.pointerId); };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) < 6) return;
    draggedRef.current = true;
    event.preventDefault();
    const next = { right: Math.max(8, Math.min(window.innerWidth - 64, dragRef.current.right - dx)), bottom: Math.max(8, Math.min(window.innerHeight - 64, dragRef.current.bottom - dy)) };
    setPosition(next);
  };
  const finishDrag = () => { if (dragRef.current && draggedRef.current && position) window.localStorage.setItem(positionKey, JSON.stringify(position)); dragRef.current = null; };

  const bubbleStyle = position ? { right: position.right, bottom: position.bottom } : undefined;
  return <>
    {preview && <div className="fixed bottom-40 right-4 z-[51] w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-[#b9d4d9] bg-white/95 p-3 text-right shadow-[0_14px_40px_rgba(13,79,98,0.22)] backdrop-blur md:bottom-24 md:right-6" dir="rtl"><div className="flex items-start gap-3"><button type="button" onClick={() => setPreview(null)} aria-label="إغلاق معاينة الرسالة" className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button><button type="button" onClick={openChat} className="min-w-0 flex-1 text-right"><p className="text-[10px] font-black tracking-wide text-[#0d7180]">رسالة جديدة · {preview.title}</p><p className="mt-1 truncate text-xs font-black text-[#102a43]">{preview.sender}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{preview.text}</p></button><MessageCircle className="mt-1 h-5 w-5 shrink-0 text-[#0d7180]" /></div></div>}
    <button type="button" style={bubbleStyle} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag} onMouseEnter={wakeBubble} onClick={openChat} aria-label={`فتح محادثات فريق العمل${unreadCount ? `، ${unreadCount} رسالة غير مقروءة` : ""}`} title="محادثات فريق العمل" className={`chat-floating-bubble fixed z-50 flex h-14 w-14 touch-none items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-[#0d7180] to-[#0d4f62] text-white shadow-[0_12px_30px_rgba(13,79,98,0.32)] transition-opacity transition-transform duration-300 hover:scale-105 hover:opacity-100 active:scale-95 ${position ? "" : "bottom-24 right-4 md:bottom-6 md:right-6"} ${isIdle ? "opacity-40" : "opacity-100"} ${unreadCount > 0 ? "chat-unread" : ""}`}><MessageCircle className="h-6 w-6" />{unreadCount > 0 && <span className="chat-unread-badge absolute -right-1 -top-2 flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#bd5147] px-1 text-[10px] font-black text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>
  </>;
}
