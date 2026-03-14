import type { CanvasElement, Bounds, FreehandElement } from "../types/document";

/**
 * Compute the axis-aligned bounding box of any element in canvas-space.
 */
export function getElementBounds(el: CanvasElement): Bounds {
  switch (el.type) {
    case "freehand":
      return getFreehandBounds(el);

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
      const x2 = el.position.x + el.endDelta.x;
      const y2 = el.position.y + el.endDelta.y;
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const pad = Math.max(el.stroke.width / 2, 4);
      return {
        x: minX - pad,
        y: minY - pad,
        width: Math.abs(x2 - x1) + pad * 2,
        height: Math.abs(y2 - y1) + pad * 2,
      };
    }

    case "connector":
      // Connector bounds are computed dynamically via getConnectorBounds.
      // Return a placeholder based on position.
      return { x: el.position.x, y: el.position.y, width: 0, height: 0 };
  }
}

function getFreehandBounds(el: FreehandElement): Bounds {
  const { position, points, stroke } = el;
  if (points.length === 0) {
    return { x: position.x, y: position.y, width: 0, height: 0 };
  }
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

/**
 * Test if a canvas-space point hits an element.
 * Uses a 4px tolerance for lines/freehand.
 */
export function hitTestElement(el: CanvasElement, cx: number, cy: number): boolean {
  if (!el.visible || el.locked) return false;

  switch (el.type) {
    case "freehand":
      return hitTestFreehandPath(el, cx, cy);

    case "text":
    case "rectangle":
    case "ellipse":
    case "image":
    case "sticky":
      return (
        cx >= el.position.x &&
        cx <= el.position.x + el.size.width &&
        cy >= el.position.y &&
        cy <= el.position.y + el.size.height
      );

    case "line":
    case "arrow": {
      const tolerance = Math.max(el.stroke.width / 2, 4);
      return (
        distToSegmentSq(
          cx,
          cy,
          el.position.x,
          el.position.y,
          el.position.x + el.endDelta.x,
          el.position.y + el.endDelta.y,
        ) <=
        tolerance * tolerance
      );
    }

    case "connector":
      // Connector hit testing is handled separately via hitTestConnector
      // because it needs access to all elements to resolve endpoints.
      return false;
  }
}

function hitTestFreehandPath(el: FreehandElement, cx: number, cy: number): boolean {
  const { position, points, stroke } = el;
  const tolerance = Math.max(stroke.width / 2, 4);
  const tolSq = tolerance * tolerance;

  for (let i = 0; i < points.length; i++) {
    const px = position.x + points[i].x;
    const py = position.y + points[i].y;
    const dx = cx - px;
    const dy = cy - py;
    if (dx * dx + dy * dy <= tolSq) return true;
    if (i > 0) {
      const prevX = position.x + points[i - 1].x;
      const prevY = position.y + points[i - 1].y;
      if (distToSegmentSq(cx, cy, prevX, prevY, px, py) <= tolSq) return true;
    }
  }
  return false;
}

function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * abx;
  const projY = ay + t * aby;
  const dx = px - projX;
  const dy = py - projY;
  return dx * dx + dy * dy;
}

/**
 * Check if a bounds rectangle overlaps with a marquee rectangle.
 */
export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export type HandlePosition = "nw" | "ne" | "sw" | "se";

const HANDLE_SIZE = 8;

/**
 * Determine if a canvas-space point hits one of the 4 corner resize handles
 * of a bounding box. Returns the handle name or null.
 * `handleSize` is the on-screen pixel size; divide by zoom to get canvas size.
 */
export function hitTestHandle(
  bounds: Bounds,
  cx: number,
  cy: number,
  zoom: number,
): HandlePosition | null {
  const hs = HANDLE_SIZE / zoom;
  const corners: Array<{ x: number; y: number; pos: HandlePosition }> = [
    { x: bounds.x, y: bounds.y, pos: "nw" },
    { x: bounds.x + bounds.width, y: bounds.y, pos: "ne" },
    { x: bounds.x, y: bounds.y + bounds.height, pos: "sw" },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height, pos: "se" },
  ];
  for (const c of corners) {
    if (cx >= c.x - hs && cx <= c.x + hs && cy >= c.y - hs && cy <= c.y + hs) {
      return c.pos;
    }
  }
  return null;
}

/**
 * Compute the union bounding box of multiple elements.
 */
export function getSelectionBounds(elements: CanvasElement[]): Bounds | null {
  if (elements.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    const b = getElementBounds(el);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
