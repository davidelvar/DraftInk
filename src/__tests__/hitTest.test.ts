import { describe, it, expect } from "vitest";
import {
  getElementBounds,
  hitTestElement,
  boundsOverlap,
  hitTestHandle,
  getSelectionBounds,
} from "../canvas/hitTest";
import type {
  RectangleElement,
  FreehandElement,
  LineElement,
  ArrowElement,
} from "../types/document";
import { DEFAULT_STROKE, DEFAULT_FILL } from "../types/document";

function makeRect(overrides: Partial<RectangleElement> = {}): RectangleElement {
  return {
    id: "rect-1",
    type: "rectangle",
    position: { x: 10, y: 10 },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { ...DEFAULT_STROKE },
    size: { width: 100, height: 50 },
    fill: { ...DEFAULT_FILL },
    cornerRadius: 0,
    ...overrides,
  };
}

function makeLine(overrides: Partial<LineElement> = {}): LineElement {
  return {
    id: "line-1",
    type: "line",
    position: { x: 0, y: 0 },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { ...DEFAULT_STROKE },
    endDelta: { x: 100, y: 0 },
    ...overrides,
  };
}

function makeFreehand(overrides: Partial<FreehandElement> = {}): FreehandElement {
  return {
    id: "fh-1",
    type: "freehand",
    position: { x: 0, y: 0 },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { ...DEFAULT_STROKE },
    points: [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ],
    isEraser: false,
    isHighlighter: false,
    ...overrides,
  };
}

describe("hitTest", () => {
  describe("getElementBounds", () => {
    it("returns bounds for rectangle", () => {
      const bounds = getElementBounds(makeRect());
      expect(bounds).toEqual({ x: 10, y: 10, width: 100, height: 50 });
    });

    it("returns bounds for line with padding", () => {
      const line = makeLine();
      const bounds = getElementBounds(line);
      // Line from (0,0) to (100,0), stroke width 2
      // pad = max(2/2, 4) = 4
      expect(bounds.x).toBe(-4);
      expect(bounds.y).toBe(-4);
      expect(bounds.width).toBe(108);
      expect(bounds.height).toBe(8);
    });

    it("returns bounds for freehand path", () => {
      const fh = makeFreehand({
        position: { x: 10, y: 10 },
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 25 },
          { x: 100, y: 0 },
        ],
      });
      const bounds = getElementBounds(fh);
      // Points: 10+0=10, 10+0=10; 10+50=60, 10+25=35; 10+100=110, 10+0=10
      // stroke width 2, pad = 1
      expect(bounds.x).toBe(9); // 10 - 1
      expect(bounds.y).toBe(9); // 10 - 1
      expect(bounds.width).toBe(102); // (110-10)+2
      expect(bounds.height).toBe(27); // (35-10)+2
    });

    it("handles empty freehand points", () => {
      const fh = makeFreehand({ points: [] });
      const bounds = getElementBounds(fh);
      expect(bounds.width).toBe(0);
      expect(bounds.height).toBe(0);
    });
  });

  describe("hitTestElement", () => {
    it("detects hit inside a rectangle", () => {
      const rect = makeRect({ position: { x: 10, y: 10 }, size: { width: 100, height: 50 } });
      expect(hitTestElement(rect, 50, 30)).toBe(true);
    });

    it("misses outside a rectangle", () => {
      const rect = makeRect();
      expect(hitTestElement(rect, 200, 200)).toBe(false);
    });

    it("detects hit on rectangle edge", () => {
      const rect = makeRect({ position: { x: 10, y: 10 }, size: { width: 100, height: 50 } });
      expect(hitTestElement(rect, 10, 10)).toBe(true);
      expect(hitTestElement(rect, 110, 60)).toBe(true);
    });

    it("misses locked elements", () => {
      const rect = makeRect({ locked: true });
      expect(hitTestElement(rect, 50, 30)).toBe(false);
    });

    it("misses invisible elements", () => {
      const rect = makeRect({ visible: false });
      expect(hitTestElement(rect, 50, 30)).toBe(false);
    });

    it("detects hit on a line segment", () => {
      const line = makeLine({ position: { x: 0, y: 0 }, endDelta: { x: 100, y: 0 } });
      // Point on the line
      expect(hitTestElement(line, 50, 0)).toBe(true);
      // Point slightly off the line (within tolerance)
      expect(hitTestElement(line, 50, 3)).toBe(true);
      // Point far from the line
      expect(hitTestElement(line, 50, 20)).toBe(false);
    });

    it("detects hit on freehand path near a segment", () => {
      const fh = makeFreehand({
        position: { x: 0, y: 0 },
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      });
      expect(hitTestElement(fh, 50, 0)).toBe(true);
      expect(hitTestElement(fh, 50, 3)).toBe(true);
      expect(hitTestElement(fh, 50, 20)).toBe(false);
    });

    it("detects hit on arrow same as line", () => {
      const arrow: ArrowElement = {
        id: "arrow-1",
        type: "arrow",
        position: { x: 0, y: 0 },
        rotation: 0,
        zIndex: 0,
        locked: false,
        visible: true,
        stroke: { ...DEFAULT_STROKE },
        endDelta: { x: 100, y: 0 },
      };
      expect(hitTestElement(arrow, 50, 0)).toBe(true);
    });
  });

  describe("boundsOverlap", () => {
    it("detects overlapping bounds", () => {
      const a = { x: 0, y: 0, width: 50, height: 50 };
      const b = { x: 25, y: 25, width: 50, height: 50 };
      expect(boundsOverlap(a, b)).toBe(true);
    });

    it("returns false for non-overlapping bounds", () => {
      const a = { x: 0, y: 0, width: 50, height: 50 };
      const b = { x: 100, y: 100, width: 50, height: 50 };
      expect(boundsOverlap(a, b)).toBe(false);
    });

    it("returns false for adjacent (touching) bounds", () => {
      const a = { x: 0, y: 0, width: 50, height: 50 };
      const b = { x: 50, y: 0, width: 50, height: 50 };
      expect(boundsOverlap(a, b)).toBe(false);
    });

    it("detects containment as overlap", () => {
      const outer = { x: 0, y: 0, width: 100, height: 100 };
      const inner = { x: 10, y: 10, width: 20, height: 20 };
      expect(boundsOverlap(outer, inner)).toBe(true);
      expect(boundsOverlap(inner, outer)).toBe(true);
    });
  });

  describe("hitTestHandle", () => {
    const bounds = { x: 100, y: 100, width: 200, height: 100 };

    it("detects northwest handle", () => {
      expect(hitTestHandle(bounds, 100, 100, 1)).toBe("nw");
    });

    it("detects northeast handle", () => {
      expect(hitTestHandle(bounds, 300, 100, 1)).toBe("ne");
    });

    it("detects southwest handle", () => {
      expect(hitTestHandle(bounds, 100, 200, 1)).toBe("sw");
    });

    it("detects southeast handle", () => {
      expect(hitTestHandle(bounds, 300, 200, 1)).toBe("se");
    });

    it("returns null when not hitting any handle", () => {
      expect(hitTestHandle(bounds, 200, 150, 1)).toBeNull();
    });

    it("respects zoom scaling for handle size", () => {
      // At zoom 2, handle size = 8/2 = 4px in canvas space
      // Point at (105,100) is 5 units from corner — should miss at zoom 2
      expect(hitTestHandle(bounds, 105, 100, 2)).toBeNull();
      // But at zoom 1, handle size = 8px — should hit
      expect(hitTestHandle(bounds, 105, 100, 1)).toBe("nw");
    });
  });

  describe("getSelectionBounds", () => {
    it("returns null for empty array", () => {
      expect(getSelectionBounds([])).toBeNull();
    });

    it("returns bounds of a single element", () => {
      const rect = makeRect({ position: { x: 10, y: 20 }, size: { width: 100, height: 50 } });
      const bounds = getSelectionBounds([rect]);
      expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it("returns union bounds of multiple elements", () => {
      const r1 = makeRect({ id: "r1", position: { x: 0, y: 0 }, size: { width: 50, height: 50 } });
      const r2 = makeRect({
        id: "r2",
        position: { x: 100, y: 100 },
        size: { width: 50, height: 50 },
      });
      const bounds = getSelectionBounds([r1, r2]);
      expect(bounds).toEqual({ x: 0, y: 0, width: 150, height: 150 });
    });
  });
});
