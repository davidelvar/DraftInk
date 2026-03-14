import type {
  CanvasElement,
  FreehandElement,
  TextElement,
  RectangleElement,
  EllipseElement,
  LineElement,
  ArrowElement,
  ImageElement,
  StickyNoteElement,
  ConnectorElement,
  Bounds,
} from "../types/document";
import { getAnchorPoint, computeConnectorPath } from "./connectors";

// ─── Image cache ────────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();
let imageLoadCallback: (() => void) | null = null;

/** Register a callback invoked when a cached image finishes loading. */
export function setImageLoadCallback(cb: () => void): void {
  imageLoadCallback = cb;
}

/** Get a cached HTMLImageElement for a data URL. Returns null while loading. */
function getCachedImage(src: string): HTMLImageElement | null {
  const existing = imageCache.get(src);
  if (existing) return existing.complete ? existing : null;
  const img = new Image();
  img.src = src;
  imageCache.set(src, img);
  img.onload = () => imageLoadCallback?.();
  return null;
}

/**
 * Render a single freehand stroke to the canvas context.
 * Assumes the context already has viewport transform applied.
 * @param lod - Level of detail: 1 = full, >1 = skip points for performance
 */
/** Check whether any point in the array has a non-default pressure value. */
function hasPressureData(points: FreehandElement["points"]): boolean {
  for (const p of points) {
    if (p.pressure !== undefined && p.pressure !== 0.5) return true;
  }
  return false;
}

/**
 * Compute the width at a single point given its pressure, base width,
 * and whether pressure sensitivity is on.
 */
function pressureWidth(pressure: number | undefined, baseWidth: number, usePressure: boolean): number {
  if (!usePressure) return baseWidth;
  const p = pressure ?? 0.5;
  // Map pressure [0..1] → width [0.25 .. 2.0] × baseWidth, centred at 1× for p=0.5
  const factor = 0.25 + p * 1.75;
  return baseWidth * factor;
}

/**
 * Draw a variable-width freehand stroke as a filled polygon.
 * For each point we compute a perpendicular offset based on the pressure-
 * derived width, then connect the left and right outlines.
 */
function drawVariableWidthPath(
  ctx: CanvasRenderingContext2D,
  points: FreehandElement["points"],
  posX: number,
  posY: number,
  strokeColor: string,
  baseWidth: number,
  lod: number,
): void {
  const step = lod;
  const src = step > 1
    ? points.filter((_, i) => i === 0 || i === points.length - 1 || i % step === 0)
    : points;

  if (src.length < 2) {
    const r = pressureWidth(src[0]?.pressure, baseWidth, true) / 2;
    ctx.beginPath();
    ctx.arc(posX + src[0].x, posY + src[0].y, Math.max(r, 0.5), 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
    return;
  }

  // Build left and right outlines
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < src.length; i++) {
    const curr = src[i];
    const halfW = pressureWidth(curr.pressure, baseWidth, true) / 2;

    // Compute tangent direction
    let dx: number, dy: number;
    if (i === 0) {
      dx = src[1].x - curr.x;
      dy = src[1].y - curr.y;
    } else if (i === src.length - 1) {
      dx = curr.x - src[i - 1].x;
      dy = curr.y - src[i - 1].y;
    } else {
      dx = src[i + 1].x - src[i - 1].x;
      dy = src[i + 1].y - src[i - 1].y;
    }

    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Normal perpendicular to the tangent
    const nx = -dy / len;
    const ny = dx / len;

    left.push({ x: posX + curr.x + nx * halfW, y: posY + curr.y + ny * halfW });
    right.push({ x: posX + curr.x - nx * halfW, y: posY + curr.y - ny * halfW });
  }

  // Draw filled polygon: left outline forward, right outline backward
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) {
    ctx.lineTo(left[i].x, left[i].y);
  }
  for (let i = right.length - 1; i >= 0; i--) {
    ctx.lineTo(right[i].x, right[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = strokeColor;
  ctx.fill();

  // Round caps at start and end
  const startR = pressureWidth(src[0].pressure, baseWidth, true) / 2;
  const endR = pressureWidth(src[src.length - 1].pressure, baseWidth, true) / 2;
  ctx.beginPath();
  ctx.arc(posX + src[0].x, posY + src[0].y, Math.max(startR, 0.5), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(posX + src[src.length - 1].x, posY + src[src.length - 1].y, Math.max(endR, 0.5), 0, Math.PI * 2);
  ctx.fill();
}

/** Draw freehand path geometry on the given context (no save/restore). */
function drawFreehandPath(
  ctx: CanvasRenderingContext2D,
  points: FreehandElement["points"],
  posX: number,
  posY: number,
  strokeColor: string,
  strokeWidth: number,
  lod: number,
  usePressure = false,
): void {
  // Use variable-width rendering when pressure data is available
  if (usePressure && points.length >= 2 && hasPressureData(points)) {
    drawVariableWidthPath(ctx, points, posX, posY, strokeColor, strokeWidth, lod);
    return;
  }

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(posX + points[0].x, posY + points[0].y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  } else if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(posX + points[0].x, posY + points[0].y);
    ctx.lineTo(posX + points[1].x, posY + points[1].y);
    ctx.stroke();
  } else {
    const step = lod;
    const lodPoints =
      step > 1
        ? points.filter((_, i) => i === 0 || i === points.length - 1 || i % step === 0)
        : points;

    ctx.beginPath();
    ctx.moveTo(posX + lodPoints[0].x, posY + lodPoints[0].y);

    for (let i = 0; i < lodPoints.length - 1; i++) {
      const curr = lodPoints[i];
      const next = lodPoints[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;

      ctx.quadraticCurveTo(
        posX + curr.x,
        posY + curr.y,
        posX + midX,
        posY + midY,
      );
    }

    const last = lodPoints[lodPoints.length - 1];
    ctx.lineTo(posX + last.x, posY + last.y);
    ctx.stroke();
  }
}

// Reusable offscreen canvas for highlighter flattening
let _hlCanvas: HTMLCanvasElement | null = null;
function getHighlighterCanvas(w: number, h: number): HTMLCanvasElement {
  if (!_hlCanvas) {
    _hlCanvas = document.createElement("canvas");
  }
  if (_hlCanvas.width < w) _hlCanvas.width = w;
  if (_hlCanvas.height < h) _hlCanvas.height = h;
  return _hlCanvas;
}

function renderFreehand(ctx: CanvasRenderingContext2D, el: FreehandElement, lod = 1, usePressure = false): void {
  const { points, position, stroke, isEraser, isHighlighter } = el;
  if (points.length === 0) return;

  ctx.save();

  if (isEraser) {
    ctx.globalCompositeOperation = "destination-out";
    drawFreehandPath(ctx, points, position.x, position.y, "rgba(0,0,0,1)", stroke.width, lod);
  } else if (isHighlighter) {
    // Flatten opacity: draw at full opacity on a temp canvas, then composite at target opacity.
    // Compute bounding box of the stroke in canvas-space.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      const px = position.x + p.x;
      const py = position.y + p.y;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    const pad = stroke.width + 2;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const bw = Math.ceil(maxX - minX);
    const bh = Math.ceil(maxY - minY);

    if (bw > 0 && bh > 0) {
      const hlCanvas = getHighlighterCanvas(bw, bh);
      const hlCtx = hlCanvas.getContext("2d")!;
      hlCtx.clearRect(0, 0, bw, bh);
      drawFreehandPath(hlCtx, points, position.x - minX, position.y - minY, stroke.color, stroke.width, lod);

      ctx.globalAlpha = stroke.opacity;
      ctx.drawImage(hlCanvas, 0, 0, bw, bh, minX, minY, bw, bh);
    }
  } else {
    ctx.globalAlpha = stroke.opacity;
    drawFreehandPath(ctx, points, position.x, position.y, stroke.color, stroke.width, lod, usePressure);
  }

  ctx.restore();
}

// ─── Shape renderers ────────────────────────────────────────────

function renderRectangle(ctx: CanvasRenderingContext2D, el: RectangleElement): void {
  const { position, size, stroke, fill, cornerRadius } = el;

  ctx.save();
  ctx.globalAlpha = stroke.opacity;

  const x = position.x;
  const y = position.y;
  const w = size.width;
  const h = size.height;

  ctx.beginPath();
  if (cornerRadius > 0) {
    const r = Math.min(cornerRadius, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }

  if (fill.color !== "transparent") {
    ctx.fillStyle = fill.color;
    ctx.globalAlpha = fill.opacity;
    ctx.fill();
    ctx.globalAlpha = stroke.opacity;
  }

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.stroke();

  ctx.restore();
}

function renderEllipse(ctx: CanvasRenderingContext2D, el: EllipseElement): void {
  const { position, size, stroke, fill } = el;

  ctx.save();
  ctx.globalAlpha = stroke.opacity;

  const cx = position.x + size.width / 2;
  const cy = position.y + size.height / 2;
  const rx = Math.abs(size.width / 2);
  const ry = Math.abs(size.height / 2);

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

  if (fill.color !== "transparent") {
    ctx.fillStyle = fill.color;
    ctx.globalAlpha = fill.opacity;
    ctx.fill();
    ctx.globalAlpha = stroke.opacity;
  }

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.stroke();

  ctx.restore();
}

function renderLine(ctx: CanvasRenderingContext2D, el: LineElement): void {
  const { position, endDelta, stroke } = el;

  ctx.save();
  ctx.globalAlpha = stroke.opacity;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(position.x, position.y);
  ctx.lineTo(position.x + endDelta.x, position.y + endDelta.y);
  ctx.stroke();

  ctx.restore();
}

function renderArrow(ctx: CanvasRenderingContext2D, el: ArrowElement): void {
  const { position, endDelta, stroke } = el;

  ctx.save();
  ctx.globalAlpha = stroke.opacity;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const x1 = position.x;
  const y1 = position.y;
  const x2 = position.x + endDelta.x;
  const y2 = position.y + endDelta.y;

  // Arrowhead geometry
  const angle = Math.atan2(endDelta.y, endDelta.x);
  const headLen = Math.max(stroke.width * 3, 10);
  const headAngle = Math.PI / 7; // ~25.7 degrees — slightly narrower

  const ax = x2 - headLen * Math.cos(angle - headAngle);
  const ay = y2 - headLen * Math.sin(angle - headAngle);
  const bx = x2 - headLen * Math.cos(angle + headAngle);
  const by = y2 - headLen * Math.sin(angle + headAngle);

  // Draw the line, stopping at the arrowhead base to avoid overlap
  const baseX = (ax + bx) / 2;
  const baseY = (ay + by) / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();

  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function renderText(ctx: CanvasRenderingContext2D, el: TextElement): void {
  const { position, text, fontSize, fontFamily, textAlign, fill, size, bold, italic } = el;
  if (!text) return;

  ctx.save();
  ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${fontSize}px ${fontFamily}`;
  ctx.fillStyle = fill.color;
  ctx.globalAlpha = fill.opacity;
  ctx.textAlign = textAlign;
  ctx.textBaseline = "top";

  const lineHeight = fontSize * 1.3;
  const rawLines = text.split("\n");

  // Word-wrap each line to fit within size.width
  const wrappedLines: string[] = [];
  for (const rawLine of rawLines) {
    if (!rawLine) {
      wrappedLines.push("");
      continue;
    }
    const words = rawLine.split(" ");
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(test).width > size.width) {
        wrappedLines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    wrappedLines.push(current);
  }

  let xBase = position.x;
  if (textAlign === "center") xBase += size.width / 2;
  else if (textAlign === "right") xBase += size.width;

  for (let i = 0; i < wrappedLines.length; i++) {
    ctx.fillText(wrappedLines[i], xBase, position.y + i * lineHeight);
  }

  ctx.restore();
}

function renderImage(ctx: CanvasRenderingContext2D, el: ImageElement): void {
  const { position, size, imageData } = el;
  const img = getCachedImage(imageData);
  if (img) {
    ctx.save();
    ctx.globalAlpha = el.stroke.opacity;
    ctx.drawImage(img, position.x, position.y, size.width, size.height);
    ctx.restore();
  } else {
    // Placeholder while loading
    ctx.save();
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(position.x, position.y, size.width, size.height);
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.strokeRect(position.x, position.y, size.width, size.height);
    // Image icon in center
    const cx = position.x + size.width / 2;
    const cy = position.y + size.height / 2;
    const iconSize = Math.min(size.width, size.height, 40) * 0.4;
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(cx - iconSize, cy - iconSize, iconSize * 2, iconSize * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - iconSize * 0.4, cy - iconSize * 0.3, iconSize * 0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - iconSize, cy + iconSize);
    ctx.lineTo(cx - iconSize * 0.2, cy + iconSize * 0.1);
    ctx.lineTo(cx + iconSize * 0.3, cy + iconSize * 0.5);
    ctx.lineTo(cx + iconSize, cy - iconSize * 0.1);
    ctx.stroke();
    ctx.restore();
  }
}

function renderStickyNote(ctx: CanvasRenderingContext2D, el: StickyNoteElement): void {
  const { position, size, text, backgroundColor, textColor, fontSize, fontFamily } = el;
  const x = position.x;
  const y = position.y;
  const w = size.width;
  const h = size.height;
  const radius = 6;

  ctx.save();

  // Shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;

  // Background
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = backgroundColor;
  ctx.fill();

  // Reset shadow before drawing text
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Text
  if (text) {
    const padding = 10;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const lineHeight = fontSize * 1.3;
    const maxWidth = w - padding * 2;
    const rawLines = text.split("\n");
    const wrappedLines: string[] = [];
    for (const rawLine of rawLines) {
      if (!rawLine) {
        wrappedLines.push("");
        continue;
      }
      const words = rawLine.split(" ");
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (current && ctx.measureText(test).width > maxWidth) {
          wrappedLines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      wrappedLines.push(current);
    }

    const maxLines = Math.floor((h - padding * 2) / lineHeight);
    for (let i = 0; i < Math.min(wrappedLines.length, maxLines); i++) {
      ctx.fillText(wrappedLines[i], x + padding, y + padding + i * lineHeight, maxWidth);
    }
  }

  ctx.restore();
}

// ─── Connector renderer ─────────────────────────────────────────

function renderConnector(
  ctx: CanvasRenderingContext2D,
  el: ConnectorElement,
  allElements: CanvasElement[],
): void {
  const sourceEl = allElements.find((e) => e.id === el.sourceId);
  const targetEl = allElements.find((e) => e.id === el.targetId);
  if (!sourceEl || !targetEl) return;

  const src = getAnchorPoint(sourceEl, el.sourceAnchor);
  const tgt = getAnchorPoint(targetEl, el.targetAnchor);
  const path = computeConnectorPath(src, tgt, el.pathStyle, el.sourceAnchor, el.targetAnchor);

  ctx.save();
  ctx.globalAlpha = el.stroke.opacity;
  ctx.strokeStyle = el.stroke.color;
  ctx.fillStyle = el.stroke.color;
  ctx.lineWidth = el.stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (el.pathStyle === "curved" && path.length === 4) {
    // Cubic bezier
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    ctx.bezierCurveTo(path[1].x, path[1].y, path[2].x, path[2].y, path[3].x, path[3].y);
    ctx.stroke();

    // Arrowhead at target
    drawArrowhead(ctx, path[2], path[3], el.stroke.width);
  } else {
    // Straight or elbow: polyline
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();

    // Arrowhead at target
    if (path.length >= 2) {
      drawArrowhead(ctx, path[path.length - 2], path[path.length - 1], el.stroke.width);
    }
  }

  ctx.restore();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  strokeWidth: number,
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLen = Math.max(strokeWidth * 3, 10);
  const headAngle = Math.PI / 7;

  const ax = to.x - headLen * Math.cos(angle - headAngle);
  const ay = to.y - headLen * Math.sin(angle - headAngle);
  const bx = to.x - headLen * Math.cos(angle + headAngle);
  const by = to.y - headLen * Math.sin(angle + headAngle);

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.closePath();
  ctx.fill();
}

/**
 * Render all elements to the canvas context (sorted by z-index).
 * Assumes viewport transform is already applied.
 *
 * @param viewportBounds - If provided, only elements intersecting this region are rendered (viewport culling).
 * @param zoom - Current zoom level for LOD calculations.
 */
export function renderElements(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  viewportBounds?: Bounds,
  zoom = 1,
  usePressure = false,
): void {
  // Sort by z-index for correct layering
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  // Compute LOD step for freehand paths based on zoom level
  // At zoom < 0.5 start skipping points, more aggressively as we zoom out
  const lodStep = zoom >= 0.5 ? 1 : zoom >= 0.25 ? 2 : zoom >= 0.1 ? 4 : 8;

  for (const el of sorted) {
    if (!el.visible) continue;

    // Viewport culling: skip elements outside the visible area
    if (viewportBounds) {
      const elBounds = getElementBoundsQuick(el);
      if (elBounds && !boundsIntersect(elBounds, viewportBounds)) continue;

      // LOD: skip tiny elements when zoomed out
      if (elBounds) {
        const screenW = elBounds.width * zoom;
        const screenH = elBounds.height * zoom;
        if (screenW < 1 && screenH < 1) continue; // Sub-pixel — skip entirely
      }
    }

    switch (el.type) {
      case "freehand":
        renderFreehand(ctx, el, lodStep, usePressure);
        break;
      case "rectangle":
        renderRectangle(ctx, el);
        break;
      case "ellipse":
        renderEllipse(ctx, el);
        break;
      case "line":
        renderLine(ctx, el);
        break;
      case "arrow":
        renderArrow(ctx, el);
        break;
      case "text":
        renderText(ctx, el);
        break;
      case "image":
        renderImage(ctx, el);
        break;
      case "sticky":
        renderStickyNote(ctx, el);
        break;
      case "connector":
        renderConnector(ctx, el, elements);
        break;
    }
  }
}

/**
 * Render an in-progress freehand stroke (not yet committed to the store).
 * Used during active drawing for real-time feedback.
 */
/** Draw stroke path geometry (no position offset, no save/restore). */
function drawStrokePath(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number; pressure?: number }>,
  strokeColor: string,
  strokeWidth: number,
  usePressure = false,
): void {
  // Variable-width rendering for live preview with pressure
  if (usePressure && points.length >= 2 && hasPressureData(points)) {
    drawVariableWidthPath(ctx, points, 0, 0, strokeColor, strokeWidth, 1);
    return;
  }

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  } else if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }

    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

export function renderActiveStroke(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number; pressure?: number }>,
  color: string,
  width: number,
  isEraser: boolean,
  isHighlighter = false,
  highlighterOpacity = 0.35,
  usePressure = false,
): void {
  if (points.length === 0) return;

  ctx.save();

  if (isEraser) {
    ctx.globalCompositeOperation = "destination-out";
    drawStrokePath(ctx, points, "rgba(0,0,0,1)", width);
  } else if (isHighlighter) {
    // Flatten opacity via offscreen canvas
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = width + 2;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const bw = Math.ceil(maxX - minX);
    const bh = Math.ceil(maxY - minY);

    if (bw > 0 && bh > 0) {
      const hlCanvas = getHighlighterCanvas(bw, bh);
      const hlCtx = hlCanvas.getContext("2d")!;
      hlCtx.clearRect(0, 0, bw, bh);
      const shifted = points.map(p => ({ x: p.x - minX, y: p.y - minY }));
      drawStrokePath(hlCtx, shifted, color, width);

      ctx.globalAlpha = highlighterOpacity;
      ctx.drawImage(hlCanvas, 0, 0, bw, bh, minX, minY, bw, bh);
    }
  } else {
    drawStrokePath(ctx, points, color, width, usePressure);
  }

  ctx.restore();
}

export type ShapeToolType = "rectangle" | "ellipse" | "line" | "arrow";

export interface ActiveShapeState {
  shapeType: ShapeToolType;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  fillColor: string;
  fillOpacity: number;
}

/**
 * Render an in-progress shape preview while the user is dragging.
 * Assumes viewport transform is already applied.
 */
export function renderActiveShape(ctx: CanvasRenderingContext2D, shape: ActiveShapeState): void {
  const {
    shapeType,
    originX,
    originY,
    currentX,
    currentY,
    strokeColor,
    strokeWidth,
    strokeOpacity,
    fillColor,
    fillOpacity,
  } = shape;

  ctx.save();
  ctx.globalAlpha = strokeOpacity;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (shapeType) {
    case "rectangle": {
      const x = Math.min(originX, currentX);
      const y = Math.min(originY, currentY);
      const w = Math.abs(currentX - originX);
      const h = Math.abs(currentY - originY);

      ctx.beginPath();
      ctx.rect(x, y, w, h);

      if (fillColor !== "transparent") {
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = fillOpacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.stroke();
      break;
    }

    case "ellipse": {
      const x = Math.min(originX, currentX);
      const y = Math.min(originY, currentY);
      const w = Math.abs(currentX - originX);
      const h = Math.abs(currentY - originY);
      const cx = x + w / 2;
      const cy = y + h / 2;

      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);

      if (fillColor !== "transparent") {
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = fillOpacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.stroke();
      break;
    }

    case "line": {
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
      break;
    }

    case "arrow": {
      // Arrowhead geometry
      const dx = currentX - originX;
      const dy = currentY - originY;
      const angle = Math.atan2(dy, dx);
      const headLen = Math.max(strokeWidth * 3, 10);
      const headAngle = Math.PI / 7;

      const ax = currentX - headLen * Math.cos(angle - headAngle);
      const ay = currentY - headLen * Math.sin(angle - headAngle);
      const bx = currentX - headLen * Math.cos(angle + headAngle);
      const by = currentY - headLen * Math.sin(angle + headAngle);

      // Line stopping at the arrowhead base
      const baseX = (ax + bx) / 2;
      const baseY = (ay + by) / 2;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(baseX, baseY);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.moveTo(currentX, currentY);
      ctx.lineTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

// ─── Internal helpers for viewport culling ──────────────────────

/** Quick bounding box for culling — avoids full freehand scan when possible. */
function getElementBoundsQuick(el: CanvasElement): Bounds | null {
  switch (el.type) {
    case "text":
    case "rectangle":
    case "ellipse":
    case "image":
    case "sticky":
      return {
        x: el.position.x,
        y: el.position.y,
        width: el.size.width,
        height: el.size.height,
      };
    case "line":
    case "arrow": {
      const x1 = el.position.x;
      const y1 = el.position.y;
      const x2 = x1 + el.endDelta.x;
      const y2 = y1 + el.endDelta.y;
      return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
    }
    case "freehand": {
      const { position, points, stroke } = el;
      if (points.length === 0) return { x: position.x, y: position.y, width: 0, height: 0 };
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of points) {
        const px = position.x + p.x;
        const py = position.y + p.y;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      const pad = stroke.width / 2;
      return {
        x: minX - pad,
        y: minY - pad,
        width: maxX - minX + stroke.width,
        height: maxY - minY + stroke.width,
      };
    }
    case "connector":
      // Connector bounds need element context; use position as fallback
      return null;
  }
}

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
