import { describe, it, expect } from "vitest";
import { simplifyPath } from "../canvas/smoothing";
import type { Point } from "../types/document";

describe("smoothing — simplifyPath", () => {
  it("returns unchanged for 0 points", () => {
    expect(simplifyPath([], 1)).toEqual([]);
  });

  it("returns unchanged for 1 point", () => {
    const pts: Point[] = [{ x: 0, y: 0 }];
    expect(simplifyPath(pts, 1)).toEqual(pts);
  });

  it("returns unchanged for 2 points", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(simplifyPath(pts, 1)).toEqual(pts);
  });

  it("keeps endpoints for collinear points", () => {
    // Perfectly straight line — all intermediate points should be removed
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 0 },
      { x: 20, y: 0 },
    ];
    const result = simplifyPath(pts, 0.5);
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
  });

  it("preserves points that deviate more than epsilon", () => {
    // Triangle-like path where the middle point is far from the line
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 100 }, // far off the first→last line
      { x: 100, y: 0 },
    ];
    const result = simplifyPath(pts, 1);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({ x: 50, y: 100 });
  });

  it("removes intermediate points within epsilon", () => {
    // Path with small deviation in the middle
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 }, // tiny deviation
      { x: 10, y: 0 },
    ];
    const result = simplifyPath(pts, 1);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[1]).toEqual({ x: 10, y: 0 });
  });

  it("preserves complex shape features", () => {
    // L-shaped path — corner must be preserved
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const result = simplifyPath(pts, 1);
    // The corner point deviates significantly from start→end line
    expect(result).toHaveLength(3);
  });

  it("handles large epsilon that simplifies everything", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 5 },
      { x: 100, y: 0 },
    ];
    const result = simplifyPath(pts, 100);
    expect(result).toHaveLength(2);
  });

  it("preserves pressure data in simplified points", () => {
    type PressurePoint = Point & { pressure: number };
    const pts: PressurePoint[] = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 50, y: 100, pressure: 0.8 },
      { x: 100, y: 0, pressure: 0.3 },
    ];
    const result = simplifyPath(pts, 1);
    expect(result).toHaveLength(3);
    expect(result[0].pressure).toBe(0.5);
    expect(result[1].pressure).toBe(0.8);
    expect(result[2].pressure).toBe(0.3);
  });
});
