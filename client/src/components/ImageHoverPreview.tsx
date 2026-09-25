import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ImageHoverPreviewProps = {
  src: string;
  alt: string;
  className?: string;
};

export function ImageHoverPreview({ src, alt, className = "" }: ImageHoverPreviewProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 8, left: 8 });

  const updatePosition = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect || typeof window === "undefined") return;
    const width = 224;
    const height = 202;
    setPosition({
      top: Math.max(8, Math.min(window.innerHeight - height - 8, rect.top - height - 10)),
      left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)),
    });
  };

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible]);

  const preview = visible && typeof document !== "undefined"
    ? createPortal(
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[100] hidden w-56 rounded-2xl border border-[#b9d4d9] bg-white p-2 shadow-[0_18px_45px_rgba(13,79,98,0.22)] sm:block"
          style={{ top: position.top, left: position.left }}
        >
          <span className="mb-1 block truncate px-1 text-right text-[10px] font-bold text-[#386672]">معاينة سريعة</span>
          <img src={src} alt={alt} className="h-44 w-full rounded-xl bg-slate-950/5 object-contain" />
        </span>,
        document.body,
      )
    : null;

  return (
    <span
      ref={anchorRef}
      className="group relative inline-flex h-full w-full items-center justify-center"
      onMouseEnter={() => { updatePosition(); setVisible(true); }}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => { updatePosition(); setVisible(true); }}
      onBlur={() => setVisible(false)}
    >
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit]">
        <img
          src={src}
          alt={alt}
          className={`max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105 ${className}`}
        />
      </span>
      {preview}
    </span>
  );
}
