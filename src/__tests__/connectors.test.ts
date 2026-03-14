import { describe, it, expect } from "vitest";
import {
  getAnchorPoint,
  hitTestAnchor,
  computeConnectorPath,
  getConnectorBounds,
  hitTestConnector,
} from "../canvas/connectors";
import type { RectangleElement, ConnectorElement, CanvasElement } from "../types/document";
import { DEFAULT_STROKE, DEFAULT_FILL } from "../types/document";

function makeRect(overrides: Partial<RectangleElement> = {}): RectangleElement {
  return {
    id: "rect-1",
    type: "rectangle",
    position: { x: 100, y: 100 },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { ...DEFAULT_STROKE },
    size: { width: 200, height: 100 },
    fill: { ...DEFAULT_FILL },
    cornerRadius: 0,
    ...overrides,
  };
}

function makeConnector(overrides: Partial<ConnectorElement> = {}): ConnectorElement {
  return {
    id: "conn-1",
    type: "connector",
    position: { x: 0, y: 0 },
    rotation: 0,
    zIndex: 1,
    locked: false,
    visible: true,
    stroke: { ...DEFAULT_STROKE },
    sourceId: "rect-1",
    targetId: "rect-2",
    sourceAnchor: "right",
    targetAnchor: "left",
    pathStyle: "straight",
    ...overrides,
  };
}

const rectA = makeRect({
  id: "rect-1",
  position: { x: 100, y: 100 },
  size: { width: 200, height: 100 },
});
const rectB = makeRect({
  id: "rect-2",
  position: { x: 500, y: 100 },
  size: { width: 200, height: 100 },
});
const elements: CanvasElement[] = [rectA, rectB];

// ─── getAnchorPoint ────────────────────────────────────────

describe("getAnchorPoint", () => {
  // rectA: position (100,100), size 200x100 → bounds x=100..300, y=100..200
  it("returns the top anchor at the top-center of the element", () => {
    const pt = getAnchorPoint(rectA, "top");
    expect(pt).toEqual({ x: 200, y: 100 });
  });

  it("returns the bottom anchor at the bottom-center", () => {
    const pt = getAnchorPoint(rectA, "bottom");
    expect(pt).toEqual({ x: 200, y: 200 });
  });

  it("returns the left anchor at the mid-left", () => {
    const pt = getAnchorPoint(rectA, "left");
    expect(pt).toEqual({ x: 100, y: 150 });
  });

  it("returns the right anchor at the mid-right", () => {
    const pt = getAnchorPoint(rectA, "right");
    expect(pt).toEqual({ x: 300, y: 150 });
  });

  it("returns the center anchor at the center of the element", () => {
    const pt = getAnchorPoint(rectA, "center");
    expect(pt).toEqual({ x: 200, y: 150 });
  });
});

// ─── hitTestAnchor ─────────────────────────────────────────

describe("hitTestAnchor", () => {
  it("returns the anchor name when clicking directly on it", () => {
    // right anchor of rectA is at (300, 150)
    const result = hitTestAnchor(rectA, 300, 150, 1);
    expect(result).toBe("right");
  });

  it("returns the anchor when clicking within tolerance at zoom 1", () => {
    // right anchor at (300, 150), click a few pixels away
    const result = hitTestAnchor(rectA, 303, 150, 1);
    expect(result).toBe("right");
  });

  it("returns null when clicking far from any anchor", () => {
    const result = hitTestAnchor(rectA, 250, 250, 1);
    expect(result).toBeNull();
  });

  it("adjusts tolerance based on zoom level", () => {
    // At high zoom, tolerance shrinks in canvas space
    // right anchor at (300, 150), click 6 canvas-pixels away
    // tolerance = (ANCHOR_RADIUS + 2) / zoom = 7/2 = 3.5 at zoom=2
    const result = hitTestAnchor(rectA, 304, 150, 2);
    expect(result).toBeNull();
  });

  it("returns the closest matching anchor when at the point", () => {
    // top anchor of rectA is at (200, 100)
    const result = hitTestAnchor(rectA, 200, 100, 1);
    expect(result).toBe("top");
  });
});

// ─── computeConnectorPath ──────────────────────────────────

describe("computeConnectorPath", () => {
  const src = { x: 300, y: 150 };
  const tgt = { x: 500, y: 150 };

  describe("straight", () => {
    it("returns two-point path from source to target", () => {
      const path = computeConnectorPath(src, tgt, "straight");
      expect(path).toEqual([src, tgt]);
    });
  });

  describe("elbow", () => {
    it("returns an orthogonal path with horizontal-horizontal anchors", () => {
      const path = computeConnectorPath(src, tgt, "elbow", "right", "left");
      expect(path.length).toBe(4);
      expect(path[0]).toEqual(src);
      expect(path[path.length - 1]).toEqual(tgt);
      // Middle points should have either same x or same y as endpoints
      expect(path[1].y).toBe(src.y);
      expect(path[2].y).toBe(tgt.y);
      expect(path[1].x).toBe(path[2].x); // vertical segment
    });

    it("returns an L-shaped path with horizontal-vertical anchors", () => {
      const path = computeConnectorPath(src, { x: 500, y: 300 }, "elbow", "right", "top");
      expect(path.length).toBe(3);
      expect(path[0]).toEqual(src);
      expect(path[path.length - 1]).toEqual({ x: 500, y: 300 });
    });

    it("returns an L-shaped path with vertical-horizontal anchors", () => {
      const path = computeConnectorPath(src, tgt, "elbow", "bottom", "left");
      expect(path.length).toBe(3);
      expect(path[0]).toEqual(src);
      expect(path[path.length - 1]).toEqual(tgt);
    });

    it("returns a path with vertical-vertical anchors", () => {
      const top = { x: 200, y: 100 };
      const bottom = { x: 400, y: 300 };
      const path = computeConnectorPath(top, bottom, "elbow", "bottom", "top");
      expect(path.length).toBe(4);
      expect(path[0]).toEqual(top);
      expect(path[path.length - 1]).toEqual(bottom);
      expect(path[1].x).toBe(top.x);
      expect(path[2].x).toBe(bottom.x);
    });
  });

  describe("curved", () => {
    it("returns four control points (source, cp1, cp2, target)", () => {
      const path = computeConnectorPath(src, tgt, "curved", "right", "left");
      expect(path.length).toBe(4);
      expect(path[0]).toEqual(src);
      expect(path[3]).toEqual(tgt);
    });

    it("places control points offset from anchors in the anchor direction", () => {
      const path = computeConnectorPath(src, tgt, "curved", "right", "left");
      // cp1 should be to the right of source
      expect(path[1].x).toBeGreaterThan(src.x);
      expect(path[1].y).toBe(src.y);
      // cp2 should be to the left of target
      expect(path[2].x).toBeLessThan(tgt.x);
      expect(path[2].y).toBe(tgt.y);
    });
  });
});

// ─── getConnectorBounds ────────────────────────────────────

describe("getConnectorBounds", () => {
  it("computes bounds from source and target anchor points", () => {
    const conn = makeConnector();
    const bounds = getConnectorBounds(conn, elements);

    // Source right anchor: (300, 150), Target left anchor: (500, 150)
    const pad = Math.max(DEFAULT_STROKE.width / 2, 4);
    expect(bounds.x).toBe(300 - pad);
    expect(bounds.y).toBe(150 - pad);
    expect(bounds.width).toBe(200 + pad * 2);
    expect(bounds.height).toBe(0 + pad * 2);
  });

  it("returns zero-size bounds for an orphaned connector", () => {
    const conn = makeConnector({ sourceId: "nonexistent" });
    const bounds = getConnectorBounds(conn, elements);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });

  it("includes all elbow waypoints in bounds", () => {
    // Use top-to-bottom connection to generate vertical elbow path
    const conn = makeConnector({ sourceAnchor: "bottom", targetAnchor: "top", pathStyle: "elbow" });
    const bounds = getConnectorBounds(conn, elements);

    // Source bottom anchor: (200, 200), Target top anchor: (600, 100)
    const pad = Math.max(DEFAULT_STROKE.width / 2, 4);
    expect(bounds.x).toBeLessThanOrEqual(200 - pad);
    expect(bounds.y).toBeLessThanOrEqual(100 - pad);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(600 + pad);
  });
});

// ─── hitTestConnector ──────────────────────────────────────

describe("hitTestConnector", () => {
  it("returns true when clicking on a straight connector path", () => {
    const conn = makeConnector();
    // Path goes from (300,150) to (500,150) — horizontal line
    const result = hitTestConnector(conn, elements, 400, 150);
    expect(result).toBe(true);
  });

  it("returns false when clicking far from the connector path", () => {
    const conn = makeConnector();
    const result = hitTestConnector(conn, elements, 400, 300);
    expect(result).toBe(false);
  });

  it("returns true near the endpoint of a straight connector", () => {
    const conn = makeConnector();
    const result = hitTestConnector(conn, elements, 301, 150);
    expect(result).toBe(true);
  });

  it("returns false for an orphaned connector", () => {
    const conn = makeConnector({ sourceId: "nonexistent" });
    const result = hitTestConnector(conn, elements, 400, 150);
    expect(result).toBe(false);
  });

  it("returns true for a point on an elbow path segment", () => {
    const conn = makeConnector({ pathStyle: "elbow" });
    // Elbow from right(300,150) to left(500,150) with horizontal anchors
    // Path: (300,150) → (400,150) → (400,150) → (500,150) — midpoint at 400
    const result = hitTestConnector(conn, elements, 400, 150);
    expect(result).toBe(true);
  });

  it("hits a curved connector near its midpoint", () => {
    const conn = makeConnector({ pathStyle: "curved" });
    // Curved path from (300,150) to (500,150) — midpoint should be near (400,150)
    const result = hitTestConnector(conn, elements, 400, 150);
    expect(result).toBe(true);
  });

  it("misses a curved connector far from the path", () => {
    const conn = makeConnector({ pathStyle: "curved" });
    const result = hitTestConnector(conn, elements, 400, 300);
    expect(result).toBe(false);
  });

  it("uses stroke width for hit tolerance", () => {
    const conn = makeConnector({
      stroke: { ...DEFAULT_STROKE, width: 20 },
    });
    // 8 pixels away from the path horizontally, but within stroke width / 2 = 10
    const result = hitTestConnector(conn, elements, 400, 158);
    expect(result).toBe(true);
  });
});
