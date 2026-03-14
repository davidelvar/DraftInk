import type { Point } from "../types/document";

/**
 * Perpendicular distance from point P to line segment AB.
 */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // A and B are the same point
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }

  const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  return num / Math.sqrt(lenSq);
}

/**
 * Ramer-Douglas-Peucker path simplification.
 * Removes points that deviate less than `epsilon` from the simplified line,
 * preserving visual quality while reducing point count.
 */
export function simplifyPath<T extends Point>(points: T[], epsilon: number): T[] {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance from the line (first → last)
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPath(points.slice(maxIdx), epsilon);
    // Join left and right, dropping duplicate at maxIdx
    return [...left.slice(0, -1), ...right];
  }

  // All intermediate points are within epsilon — keep only endpoints
  return [first, last];
}
