import { create } from "zustand";
import type { ToolType } from "./toolStore";

/**
 * Lightweight store to expose viewport zoom level and controls to UI
 * components (toolbar) without causing re-renders in the canvas.
 *
 * InfiniteCanvas writes zoom level and registers control callbacks.
 */
interface ViewportUIState {
  zoom: number;
  setZoom: (zoom: number) => void;
  /** Registered by InfiniteCanvas — zooms toward canvas center. */
  zoomBy: (delta: number) => void;
  /** Registered by InfiniteCanvas — resets view to 100% at origin. */
  resetZoom: () => void;
  /** Registered by InfiniteCanvas — returns canvas-space center of the viewport. */
  getViewportCenter: () => { x: number; y: number };
  /** Registered by InfiniteCanvas — returns current viewport state. */
  getViewport: () => { offsetX: number; offsetY: number; zoom: number };
  /** Registered by InfiniteCanvas — pans to center on a canvas-space point. */
  panTo: (canvasX: number, canvasY: number) => void;
  /** Registered by InfiniteCanvas — returns canvas element dimensions. */
  getCanvasSize: () => { width: number; height: number };
  registerControls: (controls: {
    zoomBy: (d: number) => void;
    resetZoom: () => void;
    getViewportCenter: () => { x: number; y: number };
    getViewport: () => { offsetX: number; offsetY: number; zoom: number };
    panTo: (canvasX: number, canvasY: number) => void;
    getCanvasSize: () => { width: number; height: number };
  }) => void;
  /** Whether the dot grid is visible. */
  showGrid: boolean;
  toggleGrid: () => void;
  /** Whether element positions snap to the grid when moved/resized. */
  snapToGrid: boolean;
  toggleSnapToGrid: () => void;
  /** Grid spacing in canvas-space pixels. */
  gridSnapSize: number;
  setGridSnapSize: (size: number) => void;
  /** Whether smart alignment guides are shown during move/resize. */
  showAlignmentGuides: boolean;
  toggleAlignmentGuides: () => void;
  /** Whether the minimap overlay is visible. */
  showMinimap: boolean;
  toggleMinimap: () => void;
  /** Whether presentation mode is active. */
  presentationMode: boolean;
  /** Tool that was active before entering presentation mode. */
  prePresentationTool: ToolType | null;
  enterPresentationMode: () => void;
  exitPresentationMode: () => void;
  /** Deferred pan target — consumed by InfiniteCanvas on mount. */
  pendingPanTo: { x: number; y: number } | null;
  setPendingPanTo: (target: { x: number; y: number } | null) => void;
}

export const useViewportUIStore = create<ViewportUIState>()((set) => ({
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),
  zoomBy: () => {},
  resetZoom: () => {},
  getViewportCenter: () => ({ x: 0, y: 0 }),
  getViewport: () => ({ offsetX: 0, offsetY: 0, zoom: 1 }),
  panTo: () => {},
  getCanvasSize: () => ({ width: 0, height: 0 }),
  registerControls: (controls) =>
    set({
      zoomBy: controls.zoomBy,
      resetZoom: controls.resetZoom,
      getViewportCenter: controls.getViewportCenter,
      getViewport: controls.getViewport,
      panTo: controls.panTo,
      getCanvasSize: controls.getCanvasSize,
    }),
  showGrid: true,
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  snapToGrid: false,
  toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  gridSnapSize: 20,
  setGridSnapSize: (size) => set({ gridSnapSize: Math.max(4, size) }),
  showAlignmentGuides: true,
  toggleAlignmentGuides: () => set((s) => ({ showAlignmentGuides: !s.showAlignmentGuides })),
  showMinimap: false,
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  presentationMode: false,
  prePresentationTool: null,
  enterPresentationMode: () => set({ presentationMode: true }),
  exitPresentationMode: () => set({ presentationMode: false }),
  pendingPanTo: null,
  setPendingPanTo: (target) => set({ pendingPanTo: target }),
}));
