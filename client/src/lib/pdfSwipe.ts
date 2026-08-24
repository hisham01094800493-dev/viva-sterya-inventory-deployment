export type PdfSwipeDirection = "previous" | "next";

export function getPdfSwipeDirection(start: { x: number; y: number }, end: { x: number; y: number }, threshold = 56): PdfSwipeDirection | null {
  const horizontalDistance = end.x - start.x;
  const verticalDistance = end.y - start.y;
  if (Math.abs(horizontalDistance) < threshold || Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.25) return null;
  return horizontalDistance > 0 ? "previous" : "next";
}
