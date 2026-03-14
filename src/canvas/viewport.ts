/** Viewport state representing the camera into the infinite canvas. */
export interface Viewport {
  /** X offset in canvas units (how far the camera has panned right) */
  offsetX: number;
  /** Y offset in canvas units (how far the camera has panned down) */
  offsetY: number;
  /** Zoom level: 1 = 100%, 2 = 200%, 0.5 = 50% */
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;
export const ZOOM_SENSITIVITY = 0.001;

export function createViewport(): Viewport {
  return { offsetX: 0, offsetY: 0, zoom: 1 };
}

/** Convert a screen-space point to canvas-space, given current viewport. */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: (screenX - viewport.offsetX) / viewport.zoom,
    y: (screenY - viewport.offsetY) / viewport.zoom,
  };
}

/** Convert a canvas-space point to screen-space, given current viewport. */
export function canvasToScreen(
  canvasX: number,
  canvasY: number,
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: canvasX * viewport.zoom + viewport.offsetX,
    y: canvasY * viewport.zoom + viewport.offsetY,
  };
}

/** Clamp zoom to valid range. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Compute a new viewport after zooming toward/away from a screen-space point.
 * This keeps the point under the cursor stationary.
 */
export function zoomAtPoint(
  viewport: Viewport,
  screenX: number,
  screenY: number,
  delta: number,
): Viewport {
  const newZoom = clampZoom(viewport.zoom * (1 - delta * ZOOM_SENSITIVITY));
  const zoomRatio = newZoom / viewport.zoom;

  return {
    offsetX: screenX - (screenX - viewport.offsetX) * zoomRatio,
    offsetY: screenY - (screenY - viewport.offsetY) * zoomRatio,
    zoom: newZoom,
  };
}

/**
 * Apply the viewport transformation to a canvas 2D context.
 * Call this before drawing any canvas-space content.
 */
export function applyViewportTransform(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  dpr: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.zoom, viewport.zoom);
}
