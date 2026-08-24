export function getPdfCanvasSize(width: number, height: number, zoom: number, pixelRatio: number) {
  const safeZoom = Math.min(1.75, Math.max(0.25, zoom));
  const safeRatio = Math.min(3, Math.max(1, pixelRatio));
  return {
    cssWidth: Math.round(width * safeZoom),
    cssHeight: Math.round(height * safeZoom),
    pixelWidth: Math.round(width * safeZoom * safeRatio),
    pixelHeight: Math.round(height * safeZoom * safeRatio),
    pixelRatio: safeRatio,
  };
}

export function getPdfFitZoom(pageWidth: number, availableWidth: number, zoom: number) {
  if (!Number.isFinite(pageWidth) || pageWidth <= 0 || !Number.isFinite(availableWidth) || availableWidth <= 0) return Math.min(1.75, Math.max(0.25, zoom));
  const fitZoom = Math.min(1, Math.max(0.25, availableWidth / pageWidth));
  return zoom <= 1 ? fitZoom : Math.min(1.75, zoom);
}

export function getPdfPinchZoom(baseZoom: number, startDistance: number, currentDistance: number) {
  if (!Number.isFinite(startDistance) || startDistance <= 0 || !Number.isFinite(currentDistance)) return Math.min(1.75, Math.max(0.75, baseZoom));
  return Math.min(1.75, Math.max(0.75, Number((baseZoom * (currentDistance / startDistance)).toFixed(2))));
}

export function getPdfDoubleTapZoom(currentZoom: number) {
  return currentZoom > 1 ? 1 : 1.5;
}
