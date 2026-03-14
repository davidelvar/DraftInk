import type {
  CanvasElement,
  AnchorPosition,
  ConnectorPathStyle,
  ConnectorElement,
  Bounds,
  Point,
} from "../types/document";
import { getElementBounds } from "./hitTest";

/** Anchor circle radius (in screen pixels — divide by zoom for canvas). */
export const ANCHOR_RADIUS = 5;

/** All available anchor positions on an element. */
export const ANCHOR_POSITIONS: AnchorPosition[] = ["top", "bottom", "left", "right", "center"];

/**
 * Compute the canvas-space position of an anchor point on an element.
 */
export function getAnchorPoint(el: CanvasElement, anchor: AnchorPosition): Point {
  const b = getElementBounds(el);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;

  switch (anchor) {
    case "top":
      return { x: cx, y: b.y };
    case "bottom":
      return { x: cx, y: b.y + b.height };
    case "left":
      return { x: b.x, y: cy };
    case "right":
      return { x: b.x + b.width, y: cy };
    case "center":
      return { x: cx, y: cy };
  }
}

/**
 * Find which anchor point (if any) is under a canvas-space point.
 * Returns the anchor position or null.
 */
export function hitTestAnchor(
  el: CanvasElement,
  cx: number,
  cy: number,
  zoom: number,
): AnchorPosition | null {
  const radius = (ANCHOR_RADIUS + 2) / zoom; // slight padding for easier clicking
  for (const anchor of ANCHOR_POSITIONS) {
    const pt = getAnchorPoint(el, anchor);
    const dx = cx - pt.x;
    const dy = cy - pt.y;
    if (dx * dx + dy * dy <= radius * radius) {
      return anchor;
    }
  }
  return null;
}

/**
 * Compute the path waypoints for a connector between two points.
 */
export function computeConnectorPath(
  source: Point,
  target: Point,
  style: ConnectorPathStyle,
  sourceAnchor?: AnchorPosition,
  targetAnchor?: AnchorPosition,
): Point[] {
  switch (style) {
    case "straight":
      return [source, target];
    case "elbow":
      return computeElbowPath(source, target, sourceAnchor, targetAnchor);
    case "curved":
      // For curved, we return source + two control points + target
      return computeCurvedControlPoints(source, target, sourceAnchor, targetAnchor);
  }
}

/**
 * Compute an orthogonal (elbow) path between two points.
 */
function computeElbowPath(
  source: Point,
  target: Point,
  sourceAnchor?: AnchorPosition,
  targetAnchor?: AnchorPosition,
): Point[] {
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  // Determine routing direction based on anchors
  const sourceDir = getAnchorDirection(sourceAnchor);
  const targetDir = getAnchorDirection(targetAnchor);

  // Simple elbow: one mid-point with two segments
  if (sourceDir === "horizontal" && targetDir === "horizontal") {
    const midX = source.x + dx / 2;
    return [source, { x: midX, y: source.y }, { x: midX, y: target.y }, target];
  } else if (sourceDir === "vertical" && targetDir === "vertical") {
    const midY = source.y + dy / 2;
    return [source, { x: source.x, y: midY }, { x: target.x, y: midY }, target];
  } else if (sourceDir === "horizontal" && targetDir === "vertical") {
    return [source, { x: target.x, y: source.y }, target];
  } else if (sourceDir === "vertical" && targetDir === "horizontal") {
    return [source, { x: source.x, y: target.y }, target];
  }

  // Fallback: use midpoint
  const midX = source.x + dx / 2;
  return [source, { x: midX, y: source.y }, { x: midX, y: target.y }, target];
}

function getAnchorDirection(anchor?: AnchorPosition): "horizontal" | "vertical" {
  if (anchor === "left" || anchor === "right") return "horizontal";
  if (anchor === "top" || anchor === "bottom") return "vertical";
  return "horizontal"; // default for center
}

/**
 * Compute cubic bezier control points for a curved connector.
 * Returns [source, cp1, cp2, target].
 */
function computeCurvedControlPoints(
  source: Point,
  target: Point,
  sourceAnchor?: AnchorPosition,
  targetAnchor?: AnchorPosition,
): Point[] {
  const dist = Math.hypot(target.x - source.x, target.y - source.y);
  const offset = Math.max(dist * 0.4, 30);

  const cp1 = getControlPoint(source, sourceAnchor, offset);
  const cp2 = getControlPoint(target, targetAnchor, offset);

  return [source, cp1, cp2, target];
}

function getControlPoint(pt: Point, anchor: AnchorPosition | undefined, offset: number): Point {
  switch (anchor) {
    case "top":
      return { x: pt.x, y: pt.y - offset };
    case "bottom":
      return { x: pt.x, y: pt.y + offset };
    case "left":
      return { x: pt.x - offset, y: pt.y };
    case "right":
      return { x: pt.x + offset, y: pt.y };
    default:
      return { x: pt.x + offset, y: pt.y };
  }
}

/**
 * Compute the bounding box of a connector element by resolving its endpoints.
 */
export function getConnectorBounds(connector: ConnectorElement, elements: CanvasElement[]): Bounds {
  const sourceEl = elements.find((el) => el.id === connector.sourceId);
  const targetEl = elements.find((el) => el.id === connector.targetId);

  if (!sourceEl || !targetEl) {
    // Orphaned connector — return zero-size bounds at position
    return { x: connector.position.x, y: connector.position.y, width: 0, height: 0 };
  }

  const src = getAnchorPoint(sourceEl, connector.sourceAnchor);
  const tgt = getAnchorPoint(targetEl, connector.targetAnchor);
  const path = computeConnectorPath(
    src,
    tgt,
    connector.pathStyle,
    connector.sourceAnchor,
    connector.targetAnchor,
  );

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const pad = Math.max(connector.stroke.width / 2, 4);
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/**
 * Hit test a canvas-space point against a connector's path.
 */
export function hitTestConnector(
  connector: ConnectorElement,
  elements: CanvasElement[],
  cx: number,
  cy: number,
): boolean {
  const sourceEl = elements.find((el) => el.id === connector.sourceId);
  const targetEl = elements.find((el) => el.id === connector.targetId);
  if (!sourceEl || !targetEl) return false;

  const src = getAnchorPoint(sourceEl, connector.sourceAnchor);
  const tgt = getAnchorPoint(targetEl, connector.targetAnchor);
  const path = computeConnectorPath(
    src,
    tgt,
    connector.pathStyle,
    connector.sourceAnchor,
    connector.targetAnchor,
  );

  const tolerance = Math.max(connector.stroke.width / 2, 4);
  const tolSq = tolerance * tolerance;

  if (connector.pathStyle === "curved" && path.length === 4) {
    // Sample points along the cubic bezier
    return hitTestBezierPath(path[0], path[1], path[2], path[3], cx, cy, tolSq);
  }

  // For straight/elbow: test each segment
  for (let i = 0; i < path.length - 1; i++) {
    if (distToSegmentSq(cx, cy, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y) <= tolSq) {
      return true;
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

function hitTestBezierPath(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  cx: number,
  cy: number,
  tolSq: number,
): boolean {
  // Sample the bezier curve at N points and test each segment
  const steps = 20;
  let prevX = p0.x;
  let prevY = p0.y;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
    const y =
      mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;

    if (distToSegmentSq(cx, cy, prevX, prevY, x, y) <= tolSq) {
      return true;
    }
    prevX = x;
    prevY = y;
  }
  return false;
}
