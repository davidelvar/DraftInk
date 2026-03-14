import type { Bounds } from "../types/document";

// ─── Grid Snapping ──────────────────────────────────────────────

/**
 * Snap a value to the nearest grid line.
 */
export function snapValueToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap a position {x, y} to the nearest grid intersection.
 */
export function snapPointToGrid(
  x: number,
  y: number,
  gridSize: number,
): { x: number; y: number } {
  return {
    x: snapValueToGrid(x, gridSize),
    y: snapValueToGrid(y, gridSize),
  };
}

/**
 * Snap element bounds to grid, returning the position delta to apply.
 */
export function snapBoundsToGrid(
  bounds: Bounds,
  gridSize: number,
): { dx: number; dy: number } {
  // Snap the nearest edge/center to grid
  const snappedLeft = snapValueToGrid(bounds.x, gridSize);
  const snappedTop = snapValueToGrid(bounds.y, gridSize);
  return {
    dx: snappedLeft - bounds.x,
    dy: snappedTop - bounds.y,
  };
}

// ─── Smart Alignment Guides ─────────────────────────────────────

export interface AlignmentGuide {
  /** "h" for horizontal line (constant y), "v" for vertical line (constant x) */
  orientation: "h" | "v";
  /** The canvas-space coordinate of the guide line */
  position: number;
  /** Start of the guide line extent (for rendering) */
  start: number;
  /** End of the guide line extent */
  end: number;
}

/** Threshold in canvas-space pixels for alignment snapping */
const ALIGN_THRESHOLD = 5;

interface EdgeSet {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

function boundsEdges(b: Bounds): EdgeSet {
  return {
    left: b.x,
    right: b.x + b.width,
    top: b.y,
    bottom: b.y + b.height,
    centerX: b.x + b.width / 2,
    centerY: b.y + b.height / 2,
  };
}

/**
 * Compute alignment guides + snap deltas for a moving selection against
 * other (non-selected) elements.
 *
 * Returns the snap delta to apply to the moving bounds, plus visible guide lines.
 */
export function computeAlignmentGuides(
  movingBounds: Bounds,
  otherBounds: Bounds[],
  threshold: number = ALIGN_THRESHOLD,
): { dx: number; dy: number; guides: AlignmentGuide[] } {
  if (otherBounds.length === 0) return { dx: 0, dy: 0, guides: [] };

  const moving = boundsEdges(movingBounds);

  // Collect all reference positions from other elements
  const refXPositions: number[] = [];
  const refYPositions: number[] = [];
  for (const ob of otherBounds) {
    const e = boundsEdges(ob);
    refXPositions.push(e.left, e.right, e.centerX);
    refYPositions.push(e.top, e.bottom, e.centerY);
  }

  // Check which moving edges/centers are near a reference
  const movingXEdges = [moving.left, moving.right, moving.centerX];
  const movingYEdges = [moving.top, moving.bottom, moving.centerY];

  let bestDx = Infinity;
  let bestDy = Infinity;
  let snapX: number | null = null;
  let snapY: number | null = null;

  // Find closest X snap
  for (const mx of movingXEdges) {
    for (const rx of refXPositions) {
      const dist = Math.abs(mx - rx);
      if (dist < Math.abs(bestDx) && dist <= threshold) {
        bestDx = rx - mx;
        snapX = rx;
      }
    }
  }

  // Find closest Y snap
  for (const my of movingYEdges) {
    for (const ry of refYPositions) {
      const dist = Math.abs(my - ry);
      if (dist < Math.abs(bestDy) && dist <= threshold) {
        bestDy = ry - my;
        snapY = ry;
      }
    }
  }

  const dx = snapX !== null ? bestDx : 0;
  const dy = snapY !== null ? bestDy : 0;

  // Build visible guide lines
  const guides: AlignmentGuide[] = [];

  if (snapX !== null) {
    // Vertical guide line at snapX; extend to cover moving + relevant others
    let minY = movingBounds.y + dy;
    let maxY = movingBounds.y + movingBounds.height + dy;
    for (const ob of otherBounds) {
      const e = boundsEdges(ob);
      if (
        Math.abs(e.left - snapX) < 1 ||
        Math.abs(e.right - snapX) < 1 ||
        Math.abs(e.centerX - snapX) < 1
      ) {
        minY = Math.min(minY, ob.y);
        maxY = Math.max(maxY, ob.y + ob.height);
      }
    }
    guides.push({ orientation: "v", position: snapX, start: minY - 10, end: maxY + 10 });
  }

  if (snapY !== null) {
    // Horizontal guide line at snapY
    let minX = movingBounds.x + dx;
    let maxX = movingBounds.x + movingBounds.width + dx;
    for (const ob of otherBounds) {
      const e = boundsEdges(ob);
      if (
        Math.abs(e.top - snapY) < 1 ||
        Math.abs(e.bottom - snapY) < 1 ||
        Math.abs(e.centerY - snapY) < 1
      ) {
        minX = Math.min(minX, ob.x);
        maxX = Math.max(maxX, ob.x + ob.width);
      }
    }
    guides.push({ orientation: "h", position: snapY, start: minX - 10, end: maxX + 10 });
  }

  return { dx, dy, guides };
}
