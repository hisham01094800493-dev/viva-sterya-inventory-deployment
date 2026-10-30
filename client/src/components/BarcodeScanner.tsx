import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function normalizeScannedBarcode(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 128) : null;
}

type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };

type BarcodeScannerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (value: string) => void;
  title?: string;
  description?: string;
};

export default function BarcodeScanner({ open, onOpenChange, onDetected, title = "قراءة الباركود", description = "وجّه الكاميرا نحو باركود الصنف أو QR" }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState(description);

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    setStatus(description);
    const start = async () => {
      try {
        const Detector = (window as Window & { BarcodeDetector?: new () => BarcodeDetectorLike }).BarcodeDetector;
        if (!Detector) {
          setStatus("المتصفح لا يدعم القراءة التلقائية؛ أدخل القيمة يدويًا أو استخدم Chrome حديثًا.");
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setStatus("الكاميرا غير متاحة في هذا المتصفح. أدخل القيمة يدويًا.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector();
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const result = await detector.detect(videoRef.current);
            const value = result[0]?.rawValue ? normalizeScannedBarcode(result[0].rawValue) : null;
            if (value) {
              onDetected(value);
              onOpenChange(false);
              return;
            }
          } catch {
            // Continue scanning while the camera is active.
          }
          window.setTimeout(scan, 250);
        };
        void scan();
      } catch {
        setStatus("تعذر الوصول إلى الكاميرا. اسمح بإذن الكاميرا أو أدخل القيمة يدويًا.");
      }
    };
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, [description, onDetected, onOpenChange, open]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md rounded-2xl" dir="rtl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl font-black text-[#102a43]"><ScanLine className="h-5 w-5 text-[#0d4f62]" />{title}</DialogTitle>
        <DialogDescription>{status}</DialogDescription>
      </DialogHeader>
      <div className="overflow-hidden rounded-2xl bg-slate-950"><video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" /></div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إغلاق</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
