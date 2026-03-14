import type { Bounds, CanvasElement, AnchorPosition } from "../types/document";
import type { Viewport } from "./viewport";
import type { AlignmentGuide } from "./snapping";
import { getAnchorPoint, ANCHOR_POSITIONS, ANCHOR_RADIUS } from "./connectors";

const HANDLE_SIZE = 8;
const SELECTION_COLOR = "#3b82f6";

/**
 * Draw selection bounding box and corner resize handles.
 * Assumes viewport transform is already applied to the context.
 * Handle sizes are adjusted by zoom so they look consistent on screen.
 */
export function renderSelectionBox(
  ctx: CanvasRenderingContext2D,
  bounds: Bounds,
  viewport: Viewport,
): void {
  const { x, y, width, height } = bounds;
  const hs = HANDLE_SIZE / viewport.zoom;

  ctx.save();

  // Dashed bounding box
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5 / viewport.zoom;
  ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);

  // Corner handles
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5 / viewport.zoom;

  const corners = [
    { cx: x, cy: y },
    { cx: x + width, cy: y },
    { cx: x, cy: y + height },
    { cx: x + width, cy: y + height },
  ];

  for (const c of corners) {
    ctx.fillRect(c.cx - hs / 2, c.cy - hs / 2, hs, hs);
    ctx.strokeRect(c.cx - hs / 2, c.cy - hs / 2, hs, hs);
  }

  ctx.restore();
}

/**
 * Draw a freehand lasso selection path.
 * Assumes viewport transform is already applied.
 */
export function renderLasso(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  viewport: Viewport,
): void {
  if (points.length < 2) return;
  ctx.save();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();

  ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
  ctx.fill();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5 / viewport.zoom;
  ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw alignment guide lines (thin magenta lines).
 * Assumes viewport transform is already applied.
 */
export function renderAlignmentGuides(
  ctx: CanvasRenderingContext2D,
  guides: AlignmentGuide[],
  viewport: Viewport,
): void {
  if (guides.length === 0) return;

  ctx.save();
  ctx.strokeStyle = "#e040fb"; // magenta / pink-purple
  ctx.lineWidth = 1 / viewport.zoom;
  ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom]);

  for (const g of guides) {
    ctx.beginPath();
    if (g.orientation === "v") {
      ctx.moveTo(g.position, g.start);
      ctx.lineTo(g.position, g.end);
    } else {
      ctx.moveTo(g.start, g.position);
      ctx.lineTo(g.end, g.position);
    }
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw anchor points (small circles) on an element for the connector tool.
 * Highlights the hovered anchor if provided.
 */
export function renderAnchorPoints(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  viewport: Viewport,
  hoveredAnchor?: AnchorPosition | null,
): void {
  const r = ANCHOR_RADIUS / viewport.zoom;

  ctx.save();

  for (const anchor of ANCHOR_POSITIONS) {
    const pt = getAnchorPoint(el, anchor);
    const isHovered = anchor === hoveredAnchor;

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);

    if (isHovered) {
      ctx.fillStyle = "#3b82f6";
      ctx.strokeStyle = "#ffffff";
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#3b82f6";
    }

    ctx.lineWidth = 1.5 / viewport.zoom;
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Render a preview connector line from source anchor to cursor position.
 */
export function renderConnectorPreview(
  ctx: CanvasRenderingContext2D,
  sourcePoint: { x: number; y: number },
  targetPoint: { x: number; y: number },
  viewport: Viewport,
): void {
  ctx.save();
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 2 / viewport.zoom;
  ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);

  ctx.beginPath();
  ctx.moveTo(sourcePoint.x, sourcePoint.y);
  ctx.lineTo(targetPoint.x, targetPoint.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.restore();
}
