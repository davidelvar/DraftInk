import { describe, it, expect } from "vitest";
import {
  createViewport,
  screenToCanvas,
  canvasToScreen,
  clampZoom,
  zoomAtPoint,
  MIN_ZOOM,
  MAX_ZOOM,
} from "../canvas/viewport";

describe("viewport", () => {
  describe("createViewport", () => {
    it("creates a default viewport at origin with zoom 1", () => {
      const vp = createViewport();
      expect(vp.offsetX).toBe(0);
      expect(vp.offsetY).toBe(0);
      expect(vp.zoom).toBe(1);
    });
  });

  describe("screenToCanvas", () => {
    it("identity transform at default viewport", () => {
      const vp = createViewport();
      const result = screenToCanvas(100, 200, vp);
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
    });

    it("accounts for zoom", () => {
      const vp = { offsetX: 0, offsetY: 0, zoom: 2 };
      const result = screenToCanvas(100, 200, vp);
      expect(result.x).toBe(50);
      expect(result.y).toBe(100);
    });

    it("accounts for offset", () => {
      const vp = { offsetX: 50, offsetY: 100, zoom: 1 };
      const result = screenToCanvas(150, 200, vp);
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
    });

    it("accounts for both zoom and offset", () => {
      const vp = { offsetX: 100, offsetY: 200, zoom: 2 };
      const result = screenToCanvas(200, 400, vp);
      expect(result.x).toBe(50);
      expect(result.y).toBe(100);
    });
  });

  describe("canvasToScreen", () => {
    it("identity transform at default viewport", () => {
      const vp = createViewport();
      const result = canvasToScreen(100, 200, vp);
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
    });

    it("accounts for zoom", () => {
      const vp = { offsetX: 0, offsetY: 0, zoom: 2 };
      const result = canvasToScreen(50, 100, vp);
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
    });

    it("accounts for offset", () => {
      const vp = { offsetX: 50, offsetY: 100, zoom: 1 };
      const result = canvasToScreen(100, 100, vp);
      expect(result.x).toBe(150);
      expect(result.y).toBe(200);
    });

    it("is the inverse of screenToCanvas", () => {
      const vp = { offsetX: 75, offsetY: -30, zoom: 1.5 };
      const screenPt = { x: 300, y: 450 };
      const canvasPt = screenToCanvas(screenPt.x, screenPt.y, vp);
      const back = canvasToScreen(canvasPt.x, canvasPt.y, vp);
      expect(back.x).toBeCloseTo(screenPt.x);
      expect(back.y).toBeCloseTo(screenPt.y);
    });
  });

  describe("clampZoom", () => {
    it("returns value within range unchanged", () => {
      expect(clampZoom(1)).toBe(1);
      expect(clampZoom(5)).toBe(5);
    });

    it("clamps to MIN_ZOOM", () => {
      expect(clampZoom(0.01)).toBe(MIN_ZOOM);
      expect(clampZoom(-1)).toBe(MIN_ZOOM);
    });

    it("clamps to MAX_ZOOM", () => {
      expect(clampZoom(100)).toBe(MAX_ZOOM);
      expect(clampZoom(11)).toBe(MAX_ZOOM);
    });

    it("preserves boundary values", () => {
      expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
      expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
    });
  });

  describe("zoomAtPoint", () => {
    it("zooms in (negative delta) while keeping screen point stationary", () => {
      const vp = createViewport();
      const result = zoomAtPoint(vp, 400, 300, -100);
      // Zoom should increase
      expect(result.zoom).toBeGreaterThan(1);
      // The screen point should map to the same canvas point before and after
      const canvasBefore = screenToCanvas(400, 300, vp);
      const canvasAfter = screenToCanvas(400, 300, result);
      expect(canvasAfter.x).toBeCloseTo(canvasBefore.x, 1);
      expect(canvasAfter.y).toBeCloseTo(canvasBefore.y, 1);
    });

    it("zooms out (positive delta)", () => {
      const vp = createViewport();
      const result = zoomAtPoint(vp, 400, 300, 100);
      expect(result.zoom).toBeLessThan(1);
    });

    it("clamps zoom to valid range", () => {
      const vp = { offsetX: 0, offsetY: 0, zoom: MAX_ZOOM };
      const result = zoomAtPoint(vp, 0, 0, -10000);
      expect(result.zoom).toBeLessThanOrEqual(MAX_ZOOM);

      const vp2 = { offsetX: 0, offsetY: 0, zoom: MIN_ZOOM };
      const result2 = zoomAtPoint(vp2, 0, 0, 10000);
      expect(result2.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    });

    it("delta of 0 produces no zoom change", () => {
      const vp = createViewport();
      const result = zoomAtPoint(vp, 400, 300, 0);
      expect(result.zoom).toBe(vp.zoom);
      expect(result.offsetX).toBe(vp.offsetX);
      expect(result.offsetY).toBe(vp.offsetY);
    });
  });
});
