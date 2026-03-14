import type { Viewport } from "./viewport";

const GRID_DOT_RADIUS = 1;
const GRID_BASE_SPACING = 24;

/**
 * Draw a dot-grid pattern that stays aligned to the canvas coordinate
 * system while the user pans and zooms.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  screenW: number,
  screenH: number,
  isDark: boolean,
): void {
  const { offsetX, offsetY, zoom } = viewport;

  // Choose a spacing that looks good at the current zoom level.
  // When zoomed way out, double the spacing so dots don't crowd.
  let spacing = GRID_BASE_SPACING;
  while (spacing * zoom < 12) spacing *= 2;

  // Calculate visible range in canvas space
  const startX = Math.floor(-offsetX / zoom / spacing) * spacing;
  const startY = Math.floor(-offsetY / zoom / spacing) * spacing;
  const endX = Math.ceil((screenW - offsetX) / zoom / spacing) * spacing;
  const endY = Math.ceil((screenH - offsetY) / zoom / spacing) * spacing;

  ctx.fillStyle = isDark ? "#374151" : "#d1d5db";

  const dotRadius = GRID_DOT_RADIUS / zoom; // keep visual size constant
  for (let x = startX; x <= endX; x += spacing) {
    for (let y = startY; y <= endY; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draw the origin crosshair for spatial reference (subtle). */
export function drawOriginCrosshair(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  isDark: boolean,
): void {
  const len = 20 / viewport.zoom; // keep visual size constant
  ctx.strokeStyle = isDark ? "#4b5563" : "#9ca3af";
  ctx.lineWidth = 1 / viewport.zoom;

  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.lineTo(len, 0);
  ctx.moveTo(0, -len);
  ctx.lineTo(0, len);
  ctx.stroke();
}
