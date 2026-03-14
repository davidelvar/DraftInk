import { describe, it, expect } from "vitest";
import {
  snapValueToGrid,
  snapPointToGrid,
  snapBoundsToGrid,
  computeAlignmentGuides,
} from "../canvas/snapping";
import type { Bounds } from "../types/document";

describe("snapValueToGrid", () => {
  it("snaps to nearest grid line", () => {
    expect(snapValueToGrid(11, 20)).toBe(20);
    expect(snapValueToGrid(9, 20)).toBe(0);
    expect(snapValueToGrid(10, 20)).toBe(20);
    expect(snapValueToGrid(-11, 20)).toBe(-20);
  });

  it("returns exact value if already on grid", () => {
    expect(snapValueToGrid(40, 20)).toBe(40);
    expect(snapValueToGrid(0, 20)).toBe(0);
  });
});

describe("snapPointToGrid", () => {
  it("snaps both x and y to grid", () => {
    const result = snapPointToGrid(13, 27, 20);
    expect(result.x).toBe(20);
    expect(result.y).toBe(20);
  });

  it("handles negative coordinates", () => {
    const result = snapPointToGrid(-13, -27, 20);
    expect(result.x).toBe(-20);
    expect(result.y).toBe(-20);
  });
});

describe("snapBoundsToGrid", () => {
  it("returns delta to snap top-left corner to grid", () => {
    const bounds: Bounds = { x: 13, y: 27, width: 100, height: 50 };
    const { dx, dy } = snapBoundsToGrid(bounds, 20);
    expect(dx).toBe(7); // 20 - 13
    expect(dy).toBe(-7); // 20 - 27
  });

  it("returns zero delta if already on grid", () => {
    const bounds: Bounds = { x: 40, y: 60, width: 100, height: 50 };
    const { dx, dy } = snapBoundsToGrid(bounds, 20);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });
});

describe("computeAlignmentGuides", () => {
  it("returns zero delta and no guides when no other elements", () => {
    const moving: Bounds = { x: 50, y: 50, width: 100, height: 80 };
    const result = computeAlignmentGuides(moving, []);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.guides).toHaveLength(0);
  });

  it("snaps left edge to left edge of another element", () => {
    const moving: Bounds = { x: 102, y: 200, width: 100, height: 80 };
    const other: Bounds = { x: 100, y: 50, width: 120, height: 60 };
    const result = computeAlignmentGuides(moving, [other], 5);
    expect(result.dx).toBe(-2); // snap to x=100
    expect(result.guides.some((g) => g.orientation === "v" && g.position === 100)).toBe(true);
  });

  it("snaps top edge to top edge of another element", () => {
    const moving: Bounds = { x: 200, y: 53, width: 100, height: 80 };
    const other: Bounds = { x: 50, y: 50, width: 120, height: 60 };
    const result = computeAlignmentGuides(moving, [other], 5);
    expect(result.dy).toBe(-3); // snap to y=50
    expect(result.guides.some((g) => g.orientation === "h" && g.position === 50)).toBe(true);
  });

  it("snaps center to center of another element", () => {
    // moving center x = 151, other center x = 160
    const moving: Bounds = { x: 101, y: 200, width: 100, height: 80 };
    const other: Bounds = { x: 100, y: 50, width: 120, height: 60 };
    // moving centerX = 151, other centerX = 160 — difference 9, too far for threshold 5
    // but left edges: 101 vs 100 — difference 1, within threshold
    const result = computeAlignmentGuides(moving, [other], 5);
    expect(result.dx).toBe(-1); // snap left edge to 100
  });

  it("does not snap if beyond threshold", () => {
    const moving: Bounds = { x: 200, y: 200, width: 100, height: 80 };
    const other: Bounds = { x: 50, y: 50, width: 60, height: 60 };
    const result = computeAlignmentGuides(moving, [other], 5);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.guides).toHaveLength(0);
  });

  it("snaps right edge to right edge of another element", () => {
    // moving right = 303, other right = 300
    const moving: Bounds = { x: 203, y: 200, width: 100, height: 80 };
    const other: Bounds = { x: 180, y: 50, width: 120, height: 60 };
    const result = computeAlignmentGuides(moving, [other], 5);
    expect(result.dx).toBe(-3); // snap right edge to 300
  });

  it("produces guides extending between aligned elements", () => {
    const moving: Bounds = { x: 100, y: 200, width: 100, height: 80 };
    const other: Bounds = { x: 100, y: 50, width: 120, height: 60 };
    const result = computeAlignmentGuides(moving, [other], 5);
    // Left edges align at x=100
    expect(result.dx).toBe(0);
    const vGuide = result.guides.find((g) => g.orientation === "v");
    expect(vGuide).toBeDefined();
    expect(vGuide!.position).toBe(100);
    // Guide should extend from min(50, 200) to max(110, 280) + padding
    expect(vGuide!.start).toBeLessThanOrEqual(50);
    expect(vGuide!.end).toBeGreaterThanOrEqual(280);
  });
});
