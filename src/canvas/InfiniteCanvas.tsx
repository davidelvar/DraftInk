import { useCallback, useEffect, useRef, useState } from "react";
import { applyViewportTransform, screenToCanvas, canvasToScreen } from "./viewport";
import type { Viewport } from "./viewport";
import { drawGrid, drawOriginCrosshair } from "./grid";
import {
  renderElements,
  renderActiveStroke,
  renderActiveShape,
  setImageLoadCallback,
} from "./renderElements";
import type { ActiveShapeState, ShapeToolType } from "./renderElements";
import { renderSelectionBox, renderLasso, renderAlignmentGuides, renderAnchorPoints, renderConnectorPreview } from "./renderSelection";
import { hitTestElement, hitTestHandle, getSelectionBounds, getElementBounds } from "./hitTest";
import type { HandlePosition } from "./hitTest";
import { hitTestAnchor, hitTestConnector, getConnectorBounds, getAnchorPoint } from "./connectors";
import { simplifyPath } from "./smoothing";
import { SpatialIndex, type QuadEntry } from "./quadtree";
import { useViewport } from "./useViewport";
import { useDocumentStore } from "../store/documentStore";
import { useToolStore } from "../store/toolStore";
import { useHistoryStore } from "../store/historyStore";
import { useViewportUIStore } from "../store/viewportUIStore";
import { useThemeStore } from "../store/themeStore";
import { useSettingsStore } from "../store/settingsStore";
import { useSearchStore } from "../store/searchStore";
import { snapPointToGrid, snapBoundsToGrid, computeAlignmentGuides } from "./snapping";
import type { AlignmentGuide } from "./snapping";
import type {
  FreehandElement,
  TextElement,
  RectangleElement,
  EllipseElement,
  LineElement,
  ArrowElement,
  StickyNoteElement,
  ConnectorElement,
  CanvasElement,
  Bounds,
  AnchorPosition,
} from "../types/document";
import { generateId } from "../utils/id";
import { insertImageElement, fileToDataUrl } from "../utils/image";
import ContextMenu, { type ContextMenuState } from "../components/ContextMenu";
import { MIN_ZOOM, MAX_ZOOM } from "./viewport";

const SHAPE_TOOLS = new Set<string>(["rectangle", "ellipse", "line", "arrow"]);

/** Swap default stroke colour when it would be invisible on the current canvas background. */
function themeAwareStroke(color: string): string {
  const isDark = useThemeStore.getState().resolved === "dark";
  if (isDark && color === "#1f2937") return "#f9fafb";
  if (!isDark && color === "#f9fafb") return "#1f2937";
  return color;
}

/**
 * Normalize raw PointerEvent.pressure for storage.
 * - Non-pressure devices report 0.5 by default, but some report 0 on pointerdown.
 *   Clamp to 0.5 when the device doesn't support pressure (mouse/touch without levels).
 * - Apply the user's pressure response curve (exponent).
 */
function normalizePressure(raw: number, pointerType: string): number {
  // Mouse and basic touch always report 0 or 0.5 — treat as constant 0.5
  if (pointerType !== "pen") return 0.5;
  // Pen with pressure 0 usually means "hovering" — clamp to a small minimum
  const clamped = Math.max(raw, 0.01);
  const { pressureCurve } = useSettingsStore.getState();
  return Math.pow(clamped, pressureCurve);
}

/**
 * Core canvas component with infinite pan & zoom + freehand drawing.
 *
 * Pan:   middle-click drag, or Space + left-click drag, or two-finger scroll
 * Zoom:  scroll wheel (Ctrl optional), pinch gesture
 * Draw:  left-click drag when pen/eraser tool is active
 */
export default function InfiniteCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const needsRenderRef = useRef(true);

  const { viewportRef, pan, zoom, resetView } = useViewport();

  // Expose zoom controls for the toolbar via viewport UI store
  const handleToolbarZoom = useCallback(
    (delta: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      zoom(rect.width / 2, rect.height / 2, delta);
      needsRenderRef.current = true;
    },
    [zoom],
  );

  const handleResetZoom = useCallback(() => {
    resetView();
    needsRenderRef.current = true;
  }, [resetView]);

  const handleGetViewportCenter = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return screenToCanvas(rect.width / 2, rect.height / 2, viewportRef.current);
  }, [viewportRef]);

  const handleGetViewport = useCallback(() => {
    const v = viewportRef.current;
    return { offsetX: v.offsetX, offsetY: v.offsetY, zoom: v.zoom };
  }, [viewportRef]);

  const handlePanTo = useCallback(
    (canvasX: number, canvasY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const v = viewportRef.current;
      // Center the given canvas point on screen
      viewportRef.current = {
        ...v,
        offsetX: rect.width / 2 - canvasX * v.zoom,
        offsetY: rect.height / 2 - canvasY * v.zoom,
      };
      needsRenderRef.current = true;
    },
    [viewportRef],
  );

  const handleGetCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { width: 0, height: 0 };
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }, []);

  useEffect(() => {
    useViewportUIStore.getState().registerControls({
      zoomBy: handleToolbarZoom,
      resetZoom: handleResetZoom,
      getViewportCenter: handleGetViewportCenter,
      getViewport: handleGetViewport,
      panTo: handlePanTo,
      getCanvasSize: handleGetCanvasSize,
    });

    // Apply deferred pan target (e.g. center on template content)
    const pending = useViewportUIStore.getState().pendingPanTo;
    if (pending) {
      handlePanTo(pending.x, pending.y);
      useViewportUIStore.getState().setPendingPanTo(null);
    }
  }, [handleToolbarZoom, handleResetZoom, handleGetViewportCenter, handleGetViewport, handlePanTo, handleGetCanvasSize]);

  // --- Image load callback (trigger re-render when cached images finish loading) ---
  useEffect(() => {
    setImageLoadCallback(() => {
      needsRenderRef.current = true;
    });
    return () => setImageLoadCallback(() => {});
  }, []);

  // --- Interaction state (refs to avoid re-renders) ---
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const spaceHeldRef = useRef(false);
  const previousToolRef = useRef<string | null>(null);

  // --- Drawing state (freehand) ---
  const isDrawingRef = useRef(false);
  const activePointsRef = useRef<Array<{ x: number; y: number; pressure?: number }>>([]);
  const activeOriginRef = useRef({ x: 0, y: 0 });
  const activeColorRef = useRef("#1f2937");
  const activeWidthRef = useRef(2);
  const activeIsEraserRef = useRef(false);
  const activeIsHighlighterRef = useRef(false);
  const activeOpacityRef = useRef(1);

  // --- Drawing state (shapes) ---
  const isDrawingShapeRef = useRef(false);
  const activeShapeRef = useRef<ActiveShapeState | null>(null);

  // --- Multi-touch state (pinch-to-zoom) ---
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const isPinchingRef = useRef(false);
  const lastPinchDistRef = useRef(0);
  const lastPinchCenterRef = useRef({ x: 0, y: 0 });

  // --- Selection state ---
  const isSelectingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const selectDragStartRef = useRef({ x: 0, y: 0 });
  const lassoPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const resizeHandleRef = useRef<HandlePosition | null>(null);
  const resizeOrigBoundsRef = useRef<Bounds | null>(null);
  const resizeOrigElementsRef = useRef<CanvasElement[]>([]);

  // --- Alignment guides (visible during drag/resize) ---
  const activeGuidesRef = useRef<AlignmentGuide[]>([]);

  // --- Connector tool state ---
  const connectorHoveredElRef = useRef<string | null>(null);
  const connectorHoveredAnchorRef = useRef<AnchorPosition | null>(null);
  const connectorSourceRef = useRef<{
    elementId: string;
    anchor: AnchorPosition;
  } | null>(null);
  const connectorCursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // --- Laser pointer trail (ephemeral, not saved) ---
  const laserTrailRef = useRef<Array<{ x: number; y: number; time: number }>>([]);
  const laserCursorRef = useRef<{ x: number; y: number } | null>(null);

  // --- Text editing state ---
  const [editingText, setEditingText] = useState(false);
  // --- Context menu state ---
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // --- Selection action bar ref ---
  const selectionBarRef = useRef<HTMLDivElement>(null);
  const textEditRef = useRef<{
    id: string | null;
    canvasX: number;
    canvasY: number;
    width: number | null; // null = auto-size to content
    height: number | null;
    fontSize: number;
    fontFamily: string;
    color: string;
    bold: boolean;
    italic: boolean;
    textAlign: "left" | "center" | "right";
    stickyBg: string | null;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const isDrawingTextRef = useRef(false);
  const textDrawStartRef = useRef({ x: 0, y: 0 });
  const textDrawCurrentRef = useRef({ x: 0, y: 0 });

  // Request a repaint on the next animation frame
  const requestRender = useCallback(() => {
    needsRenderRef.current = true;
  }, []);

  // ─── Spatial index for fast hit-testing and viewport culling ──
  const spatialIndexRef = useRef(new SpatialIndex());
  const lastElementVersionRef = useRef<CanvasElement[] | null>(null);

  /** Compute the visible canvas-space region from the viewport transform. */
  const getViewportBounds = useCallback((viewport: Viewport, w: number, h: number): Bounds => {
    const topLeft = screenToCanvas(0, 0, viewport);
    const bottomRight = screenToCanvas(w, h, viewport);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }, []);

  // ─── Render loop ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Re-render when theme changes
    const unsubTheme = useThemeStore.subscribe(() => {
      needsRenderRef.current = true;
    });

    // Re-render when grid visibility changes
    const unsubGrid = useViewportUIStore.subscribe(() => {
      needsRenderRef.current = true;
    });

    let prevW = 0;
    let prevH = 0;

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);

      // Handle resize
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const pixelW = Math.round(w * dpr);
      const pixelH = Math.round(h * dpr);

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
        prevW = w;
        prevH = h;
        needsRenderRef.current = true;
      }

      if (!needsRenderRef.current) return;
      needsRenderRef.current = false;

      const viewport = viewportRef.current;

      // Sync zoom level to UI store for toolbar display
      useViewportUIStore.getState().setZoom(viewport.zoom);

      const isDark = useThemeStore.getState().resolved === "dark";

      // Clear entire screen
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = isDark ? "#111827" : "#ffffff";
      ctx.fillRect(0, 0, prevW || w, prevH || h);

      // Apply viewport transform then draw canvas-space content
      applyViewportTransform(ctx, viewport, dpr);

      if (useViewportUIStore.getState().showGrid) {
        drawGrid(ctx, viewport, w, h, isDark);
        drawOriginCrosshair(ctx, viewport, isDark);
      }

      // Render committed elements from the document store
      const elements = useDocumentStore.getState().board.elements;
      const editingId = textEditRef.current?.id;
      const isEditingSticky = editingId && elements.find((el) => el.id === editingId)?.type === "sticky";
      const elementsToRender = editingId && !isEditingSticky ? elements.filter((el) => el.id !== editingId) : elements;

      // Rebuild spatial index when elements change (reference check)
      if (elements !== lastElementVersionRef.current) {
        lastElementVersionRef.current = elements;
        const entries: QuadEntry[] = elements.map((el) => ({
          id: el.id,
          bounds: el.type === "connector"
            ? getConnectorBounds(el, elements)
            : getElementBounds(el),
        }));
        spatialIndexRef.current.rebuild(entries);
      }

      // Compute viewport bounds for culling + LOD
      const viewportBounds = getViewportBounds(viewport, w, h);
      const usePressure = useSettingsStore.getState().pressureSensitivity;
      renderElements(ctx, elementsToRender, viewportBounds, viewport.zoom, usePressure);

      // Render in-progress stroke
      if (isDrawingRef.current && activePointsRef.current.length > 0) {
        const origin = activeOriginRef.current;
        const usePressureActive = useSettingsStore.getState().pressureSensitivity;
        renderActiveStroke(
          ctx,
          activePointsRef.current.map((p) => ({
            x: origin.x + p.x,
            y: origin.y + p.y,
            pressure: p.pressure,
          })),
          activeColorRef.current,
          activeWidthRef.current,
          activeIsEraserRef.current,
          activeIsHighlighterRef.current,
          activeOpacityRef.current,
          usePressureActive,
        );
      }

      // Render in-progress shape preview
      if (isDrawingShapeRef.current && activeShapeRef.current) {
        renderActiveShape(ctx, activeShapeRef.current);
      }

      // Render in-progress text box preview
      if (isDrawingTextRef.current) {
        const s = textDrawStartRef.current;
        const c = textDrawCurrentRef.current;
        const x = Math.min(s.x, c.x);
        const y = Math.min(s.y, c.y);
        const w = Math.abs(c.x - s.x);
        const h = Math.abs(c.y - s.y);
        ctx.save();
        ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1.5 / viewport.zoom;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }

      // Render selection overlays
      const selectedIds = useDocumentStore.getState().selectedIds;
      if (selectedIds.size > 0) {
        const selectedElements = elements.filter((el) => selectedIds.has(el.id));
        const bounds = getSelectionBounds(selectedElements);
        if (bounds) {
          renderSelectionBox(ctx, bounds, viewport);
          // Position selection action bar above the selection (hide during drag/resize)
          if (selectionBarRef.current) {
            const isDraggingOrResizing = isDraggingRef.current || isResizingRef.current;
            if (isDraggingOrResizing) {
              selectionBarRef.current.style.display = "none";
            } else {
              const topCenter = canvasToScreen(bounds.x + bounds.width / 2, bounds.y, viewport);
              selectionBarRef.current.style.left = `${topCenter.x}px`;
              selectionBarRef.current.style.top = `${topCenter.y - 48}px`;
              selectionBarRef.current.style.display = "flex";
            }
          }
        }
      } else {
        if (selectionBarRef.current) {
          selectionBarRef.current.style.display = "none";
        }
      }

      // Render search highlights
      const searchState = useSearchStore.getState();
      if (searchState.open && searchState.highlightIds.size > 0) {
        for (const el of elements) {
          if (!searchState.highlightIds.has(el.id)) continue;
          const bounds = getElementBounds(el);
          if (!bounds) continue;
          const isActive = el.id === searchState.activeHighlightId;
          ctx.save();
          ctx.strokeStyle = isActive ? "#f97316" : "#fb923c";
          ctx.lineWidth = (isActive ? 2.5 : 1.5) / viewport.zoom;
          ctx.setLineDash(isActive ? [] : [6 / viewport.zoom, 3 / viewport.zoom]);
          const pad = 4 / viewport.zoom;
          ctx.strokeRect(
            bounds.x - pad,
            bounds.y - pad,
            bounds.width + pad * 2,
            bounds.height + pad * 2,
          );
          if (isActive) {
            ctx.fillStyle = "rgba(249, 115, 22, 0.08)";
            ctx.fillRect(
              bounds.x - pad,
              bounds.y - pad,
              bounds.width + pad * 2,
              bounds.height + pad * 2,
            );
          }
          ctx.restore();
        }
      }

      // Render alignment guides during drag/resize
      if (
        (isDraggingRef.current || isResizingRef.current) &&
        activeGuidesRef.current.length > 0
      ) {
        renderAlignmentGuides(ctx, activeGuidesRef.current, viewport);
      }

      // Render connector tool overlays (anchor points + preview line)
      if (useToolStore.getState().activeTool === "connector") {
        const hoveredElId = connectorHoveredElRef.current;
        if (hoveredElId) {
          const hoveredEl = elements.find((el) => el.id === hoveredElId);
          if (hoveredEl) {
            renderAnchorPoints(ctx, hoveredEl, viewport, connectorHoveredAnchorRef.current);
          }
        }
        // Show source element anchors while drawing connector
        const connSrc = connectorSourceRef.current;
        if (connSrc) {
          const srcEl = elements.find((el) => el.id === connSrc.elementId);
          if (srcEl) {
            if (srcEl.id !== hoveredElId) {
              renderAnchorPoints(ctx, srcEl, viewport, connSrc.anchor);
            }
            // Draw preview line from source anchor to cursor
            const srcPt = getAnchorPoint(srcEl, connSrc.anchor);
            renderConnectorPreview(ctx, srcPt, connectorCursorRef.current, viewport);
          }
        }
      }

      // Render lasso
      if (isSelectingRef.current && lassoPointsRef.current.length > 1) {
        renderLasso(ctx, lassoPointsRef.current, viewport);
      }

      // Render laser pointer trail (ephemeral, canvas-space)
      const now = performance.now();
      const LASER_FADE_MS = 500;
      const trail = laserTrailRef.current;
      if (trail.length > 0) {
        // Prune stale points
        while (trail.length > 0 && now - trail[0].time > LASER_FADE_MS) {
          trail.shift();
        }
        if (trail.length > 0) {
          for (const pt of trail) {
            const age = now - pt.time;
            const alpha = Math.max(0, 1 - age / LASER_FADE_MS);
            const radius = (6 + 4 * alpha) / viewport.zoom;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
            ctx.fill();
            // Glow
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius * 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.25})`;
            ctx.fill();
          }
          // Keep re-rendering while trail is active
          needsRenderRef.current = true;
        }
      }

      // Render bright laser cursor dot at current position
      if (useToolStore.getState().activeTool === "laser" && laserCursorRef.current) {
        const lc = laserCursorRef.current;
        const dotRadius = 8 / viewport.zoom;
        ctx.beginPath();
        ctx.arc(lc.x, lc.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
        ctx.fill();
        // Outer glow
        ctx.beginPath();
        ctx.arc(lc.x, lc.y, dotRadius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
        ctx.fill();
        needsRenderRef.current = true;
      }

      // Reset transform for screen-space overlays
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Zoom indicator (screen-space)
      const zoomPct = Math.round(viewport.zoom * 100);
      ctx.fillStyle = isDark ? "#6b7280" : "#9ca3af";
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${zoomPct}%`, w - 12, h - 28);

      // Position text editing overlay to track viewport changes
      if (textContainerRef.current && textEditRef.current) {
        const te = textEditRef.current;
        const screen = canvasToScreen(te.canvasX, te.canvasY, viewport);
        textContainerRef.current.style.left = `${screen.x}px`;
        textContainerRef.current.style.top = `${screen.y}px`;
        const scaledSize = te.fontSize * viewport.zoom;
        if (textareaRef.current) {
          textareaRef.current.style.fontSize = `${scaledSize}px`;
          textareaRef.current.style.fontWeight = te.bold ? "bold" : "normal";
          textareaRef.current.style.fontStyle = te.italic ? "italic" : "normal";
          if (te.width !== null) {
            textareaRef.current.style.width = `${te.width * viewport.zoom}px`;
          }
          if (te.height !== null) {
            textareaRef.current.style.minHeight = `${te.height * viewport.zoom}px`;
          }
        }
      }
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      unsubTheme();
      unsubGrid();
    };
  }, [viewportRef]);

  // ─── Helper: get canvas-space coords from pointer event ───────
  const pointerToCanvas = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      return screenToCanvas(screenX, screenY, viewportRef.current);
    },
    [viewportRef],
  );

  // ─── Text editing helpers ─────────────────────────────────────
  const commitText = useCallback(() => {
    const te = textEditRef.current;
    const textarea = textareaRef.current;
    if (!te || !textarea) return;

    textEditRef.current = null; // Prevent double-commit from blur
    const text = textarea.value.trim();

    // Compute measured size for the text
    const computeSize = (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.font = `${te.italic ? "italic " : ""}${te.bold ? "bold " : ""}${te.fontSize}px ${te.fontFamily}`;
      const lines = text.split("\n");
      let maxW = 0;
      for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
      ctx.restore();
      const lineHeight = te.fontSize * 1.3;
      const measuredW = Math.max(maxW + 4, 20);
      const measuredH = Math.max(lines.length * lineHeight, lineHeight);
      return {
        width: te.width !== null ? Math.max(te.width, 20) : measuredW,
        height: te.height !== null ? Math.max(te.height, lineHeight) : measuredH,
      };
    };

    if (te.id) {
      // Check if we're editing a sticky note
      const existingEl = useDocumentStore.getState().getElementById(te.id);
      if (existingEl?.type === "sticky") {
        useHistoryStore.getState().pushSnapshot();
        useDocumentStore.getState().updateElement(te.id, { text });
      } else if (text) {
        // Re-editing an existing text element
        useHistoryStore.getState().pushSnapshot();
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
          const size = computeSize(ctx);
          useDocumentStore.getState().updateElement(te.id, {
            text,
            fontSize: te.fontSize,
            fontFamily: te.fontFamily,
            bold: te.bold,
            italic: te.italic,
            fill: { color: te.color, opacity: 1 },
            textAlign: te.textAlign,
            size,
          });
        }
      } else {
        // Empty text — remove the element
        useHistoryStore.getState().pushSnapshot();
        useDocumentStore.getState().removeElements([te.id]);
      }
    } else if (text) {
      // Creating a new text element
      useHistoryStore.getState().pushSnapshot();
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        const size = computeSize(ctx);
        const element: TextElement = {
          id: generateId(),
          type: "text",
          position: { x: te.canvasX, y: te.canvasY },
          rotation: 0,
          zIndex: 0,
          locked: false,
          visible: true,
          stroke: { color: te.color, width: 0, opacity: 1 },
          text,
          fontSize: te.fontSize,
          fontFamily: te.fontFamily,
          textAlign: te.textAlign,
          bold: te.bold,
          italic: te.italic,
          fill: { color: te.color, opacity: 1 },
          size,
        };
        useDocumentStore.getState().addElements([element]);
      }
    }

    setEditingText(false);
    requestRender();
  }, [requestRender]);

  const handleTextInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || !textEditRef.current || !canvasRef.current) return;
    const te = textEditRef.current;
    const zoom = viewportRef.current.zoom;
    const scaledSize = te.fontSize * zoom;

    if (te.width !== null) {
      // Fixed-width text box — use the defined width
      ta.style.width = `${te.width * zoom}px`;
    } else {
      // Auto-size to content
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.font = `${te.italic ? "italic " : ""}${te.bold ? "bold " : ""}${scaledSize}px ${te.fontFamily}`;
      const lines = ta.value.split("\n");
      let maxW = 0;
      for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line || " ").width);
      ctx.restore();
      ta.style.width = `${Math.max(maxW + 8, scaledSize * 2)}px`;
    }
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [viewportRef]);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const canvasPos = screenToCanvas(
        e.clientX - rect.left,
        e.clientY - rect.top,
        viewportRef.current,
      );

      const elements = useDocumentStore.getState().board.elements;
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (!el.visible) continue;
        if (el.type !== "text" && el.type !== "sticky") continue;
        if (
          canvasPos.x >= el.position.x &&
          canvasPos.x <= el.position.x + el.size.width &&
          canvasPos.y >= el.position.y &&
          canvasPos.y <= el.position.y + el.size.height
        ) {
          if (textEditRef.current) commitText();
          if (el.type === "text") {
            textEditRef.current = {
              id: el.id,
              canvasX: el.position.x,
              canvasY: el.position.y,
              width: el.size.width,
              height: el.size.height,
              fontSize: el.fontSize,
              fontFamily: el.fontFamily,
              color: el.fill.color,
              bold: el.bold,
              italic: el.italic,
              textAlign: el.textAlign,
              stickyBg: null,
            };
          } else {
            textEditRef.current = {
              id: el.id,
              canvasX: el.position.x,
              canvasY: el.position.y,
              width: el.size.width,
              height: el.size.height,
              fontSize: el.fontSize,
              fontFamily: el.fontFamily,
              color: el.textColor,
              bold: false,
              italic: false,
              textAlign: "left",
              stickyBg: el.backgroundColor,
            };
          }
          setEditingText(true);
          requestRender();
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.value = el.text;
              textareaRef.current.focus();
              textareaRef.current.select();
              handleTextInput();
            }
          });
          return;
        }
      }
    },
    [viewportRef, commitText, requestRender, handleTextInput],
  );

  // ─── Pointer events ──────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // ─── Multi-touch: track all touches for pinch-to-zoom ────
      if (e.pointerType === "touch") {
        activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

        if (activeTouchesRef.current.size === 2) {
          // Cancel any in-progress single-finger action
          if (isDrawingRef.current) {
            isDrawingRef.current = false;
            activePointsRef.current = [];
          }
          if (isDrawingShapeRef.current) {
            isDrawingShapeRef.current = false;
            activeShapeRef.current = null;
          }
          isDrawingTextRef.current = false;
          isSelectingRef.current = false;
          isDraggingRef.current = false;
          isPanningRef.current = false;
          lassoPointsRef.current = [];

          // Start pinch gesture
          isPinchingRef.current = true;
          const [a, b] = [...activeTouchesRef.current.values()];
          lastPinchDistRef.current = Math.hypot(b.x - a.x, b.y - a.y);
          lastPinchCenterRef.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          e.preventDefault();
          requestRender();
          return;
        }

        if (activeTouchesRef.current.size > 2) {
          e.preventDefault();
          return;
        }
        // Single touch falls through to normal handling below
      }

      // Middle button, space + left button, or hand tool + left button → pan
      if (
        e.button === 1 ||
        (e.button === 0 && spaceHeldRef.current) ||
        (e.button === 0 && useToolStore.getState().activeTool === "hand")
      ) {
        isPanningRef.current = true;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      // ─── Pen eraser button (back of stylus) ─────────────────
      if (e.pointerType === "pen" && e.button === 5) {
        const canvasPos = pointerToCanvas(e);
        const tool = useToolStore.getState();
        useHistoryStore.getState().pushSnapshot();
        isDrawingRef.current = true;
        activeOriginRef.current = { x: canvasPos.x, y: canvasPos.y };
        activePointsRef.current = [{ x: 0, y: 0, pressure: normalizePressure(e.pressure, e.pointerType) }];
        activeColorRef.current = tool.strokeColor;
        activeWidthRef.current = tool.eraserWidth;
        activeIsEraserRef.current = true;
        activeIsHighlighterRef.current = false;
        activeOpacityRef.current = 1;
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        requestRender();
        return;
      }

      // If text editor is open, commit it first
      if (e.button === 0 && textEditRef.current) {
        commitText();
      }

      // Left button → draw (if pen or eraser tool) or shape
      if (e.button === 0) {
        const tool = useToolStore.getState();
        if (tool.activeTool === "pen" || tool.activeTool === "eraser" || tool.activeTool === "highlighter") {
          const isEraser = tool.activeTool === "eraser";
          const isHighlighter = tool.activeTool === "highlighter";
          const canvasPos = pointerToCanvas(e);

          useHistoryStore.getState().pushSnapshot();
          isDrawingRef.current = true;
          activeOriginRef.current = { x: canvasPos.x, y: canvasPos.y };
          activePointsRef.current = [{ x: 0, y: 0, pressure: normalizePressure(e.pressure, e.pointerType) }];
          activeColorRef.current = themeAwareStroke(tool.strokeColor);
          activeWidthRef.current = isEraser ? tool.eraserWidth : isHighlighter ? tool.highlighterWidth : tool.strokeWidth;
          activeIsEraserRef.current = isEraser;
          activeIsHighlighterRef.current = isHighlighter;
          activeOpacityRef.current = tool.strokeOpacity;

          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          e.preventDefault();
          requestRender();
        } else if (SHAPE_TOOLS.has(tool.activeTool)) {
          const canvasPos = pointerToCanvas(e);
          let ox = canvasPos.x;
          let oy = canvasPos.y;
          if (useViewportUIStore.getState().snapToGrid) {
            const gs = useViewportUIStore.getState().gridSnapSize;
            const snapped = snapPointToGrid(ox, oy, gs);
            ox = snapped.x;
            oy = snapped.y;
          }

          isDrawingShapeRef.current = true;
          activeShapeRef.current = {
            shapeType: tool.activeTool as ShapeToolType,
            originX: ox,
            originY: oy,
            currentX: ox,
            currentY: oy,
            strokeColor: themeAwareStroke(tool.strokeColor),
            strokeWidth: tool.strokeWidth,
            strokeOpacity: tool.strokeOpacity,
            fillColor: tool.fillColor,
            fillOpacity: tool.fillOpacity,
          };

          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          e.preventDefault();
          requestRender();
        } else if (tool.activeTool === "text") {
          const canvasPos = pointerToCanvas(e);
          isDrawingTextRef.current = true;
          textDrawStartRef.current = { x: canvasPos.x, y: canvasPos.y };
          textDrawCurrentRef.current = { x: canvasPos.x, y: canvasPos.y };
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          e.preventDefault();
        } else if (tool.activeTool === "sticky") {
          const canvasPos = pointerToCanvas(e);
          useHistoryStore.getState().pushSnapshot();
          const stickyColor = useToolStore.getState().stickyColor;
          const settings = useSettingsStore.getState();
          const element: StickyNoteElement = {
            id: generateId(),
            type: "sticky",
            position: { x: canvasPos.x - 100, y: canvasPos.y - 75 },
            rotation: 0,
            zIndex: 0,
            locked: false,
            visible: true,
            stroke: { color: "transparent", width: 0, opacity: 1 },
            size: { width: 200, height: 150 },
            text: "",
            backgroundColor: stickyColor,
            textColor: "#1e1b18",
            fontSize: settings.defaultFontSize,
            fontFamily: settings.defaultFontFamily,
          };
          useDocumentStore.getState().addElements([element]);
          // Open text editing on the new sticky note
          textEditRef.current = {
            id: element.id,
            canvasX: element.position.x,
            canvasY: element.position.y,
            width: 200,
            height: 150,
            fontSize: settings.defaultFontSize,
            fontFamily: settings.defaultFontFamily,
            color: "#1e1b18",
            bold: false,
            italic: false,
            textAlign: "left",
            stickyBg: stickyColor,
          };
          setEditingText(true);
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.value = "";
              textareaRef.current.focus();
              handleTextInput();
            }
          });
          requestRender();
          e.preventDefault();
        } else if (tool.activeTool === "connector") {
          const canvasPos = pointerToCanvas(e);
          const store = useDocumentStore.getState();
          const elements = store.board.elements;

          // Find element under cursor (exclude connectors as valid targets)
          let hitEl: CanvasElement | undefined;
          for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            if (el.type === "connector" || !el.visible || el.locked) continue;
            if (hitTestElement(el, canvasPos.x, canvasPos.y)) {
              hitEl = el;
              break;
            }
          }

          if (hitEl) {
            const anchor = hitTestAnchor(hitEl, canvasPos.x, canvasPos.y, viewportRef.current.zoom);
            const chosenAnchor = anchor || "center";

            if (connectorSourceRef.current) {
              // Complete the connector
              const src = connectorSourceRef.current;
              if (src.elementId !== hitEl.id) {
                useHistoryStore.getState().pushSnapshot();
                const connectorEl: ConnectorElement = {
                  id: generateId(),
                  type: "connector",
                  position: { x: 0, y: 0 },
                  rotation: 0,
                  zIndex: 0,
                  locked: false,
                  visible: true,
                  stroke: {
                    color: themeAwareStroke(tool.strokeColor),
                    width: tool.strokeWidth,
                    opacity: 1,
                  },
                  sourceId: src.elementId,
                  targetId: hitEl.id,
                  sourceAnchor: src.anchor,
                  targetAnchor: chosenAnchor,
                  pathStyle: tool.connectorStyle,
                };
                store.addElements([connectorEl]);
              }
              connectorSourceRef.current = null;
            } else {
              // Start a new connector
              connectorSourceRef.current = {
                elementId: hitEl.id,
                anchor: chosenAnchor,
              };
            }
          } else {
            // Clicked empty space — cancel connector creation
            connectorSourceRef.current = null;
          }

          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          e.preventDefault();
          requestRender();
        } else if (tool.activeTool === "select") {
          const canvasPos = pointerToCanvas(e);
          const store = useDocumentStore.getState();

          // Check if clicking on a resize handle of current selection
          if (store.selectedIds.size > 0) {
            const selectedEls = store.board.elements.filter((el) => store.selectedIds.has(el.id));
            const selBounds = getSelectionBounds(selectedEls);
            if (selBounds) {
              const handle = hitTestHandle(
                selBounds,
                canvasPos.x,
                canvasPos.y,
                viewportRef.current.zoom,
              );
              if (handle) {
                useHistoryStore.getState().pushSnapshot();
                isResizingRef.current = true;
                resizeHandleRef.current = handle;
                resizeOrigBoundsRef.current = selBounds;
                resizeOrigElementsRef.current = selectedEls.map((el) => ({ ...el }));
                selectDragStartRef.current = { x: canvasPos.x, y: canvasPos.y };
                (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
                e.preventDefault();
                return;
              }
            }
          }

          // Check if clicking on any element — use spatial index for fast lookup
          const elements = store.board.elements;
          let hitElement: CanvasElement | undefined;

          // First narrow candidates via spatial index (point query)
          const candidates = spatialIndexRef.current.queryPoint(canvasPos.x, canvasPos.y);
          if (candidates.length > 0) {
            const candidateIds = new Set(candidates.map((c) => c.id));
            // Check candidates in reverse z-order for correct top-most hit
            for (let i = elements.length - 1; i >= 0; i--) {
              if (!candidateIds.has(elements[i].id)) continue;
              if (hitTestElement(elements[i], canvasPos.x, canvasPos.y)) {
                hitElement = elements[i];
                break;
              }
            }
          }

          // Fallback: if spatial index missed, do a linear scan
          // (handles thin elements whose padded bounds may not be indexed yet)
          if (!hitElement) {
            for (let i = elements.length - 1; i >= 0; i--) {
              const el = elements[i];
              if (el.type === "connector") {
                if (hitTestConnector(el, elements, canvasPos.x, canvasPos.y)) {
                  hitElement = el;
                  break;
                }
              } else if (hitTestElement(el, canvasPos.x, canvasPos.y)) {
                hitElement = el;
                break;
              }
            }
          }

          if (hitElement) {
            if (e.shiftKey) {
              // Shift-click toggles selection
              if (store.selectedIds.has(hitElement.id)) {
                store.deselect([hitElement.id]);
              } else {
                store.select([hitElement.id]);
              }
            } else if (!store.selectedIds.has(hitElement.id)) {
              store.clearSelection();
              store.select([hitElement.id]);
            }
            // Start drag-move
            useHistoryStore.getState().pushSnapshot();
            isDraggingRef.current = true;
            selectDragStartRef.current = { x: canvasPos.x, y: canvasPos.y };
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            e.preventDefault();
            requestRender();
          } else if (store.selectedIds.size > 0) {
            // No element directly hit — check if click is inside the selection bounding box
            // so the user can drag the group by clicking anywhere within the selection area
            const selectedEls = store.board.elements.filter((el) => store.selectedIds.has(el.id));
            const selBounds = getSelectionBounds(selectedEls);
            if (
              selBounds &&
              canvasPos.x >= selBounds.x &&
              canvasPos.x <= selBounds.x + selBounds.width &&
              canvasPos.y >= selBounds.y &&
              canvasPos.y <= selBounds.y + selBounds.height
            ) {
              // Click is inside selection bounds → drag the group
              useHistoryStore.getState().pushSnapshot();
              isDraggingRef.current = true;
              selectDragStartRef.current = { x: canvasPos.x, y: canvasPos.y };
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              e.preventDefault();
              requestRender();
            } else {
              // Click outside selection bounds → deselect and start marquee
              if (!e.shiftKey) {
                store.clearSelection();
              }
              isSelectingRef.current = true;
              lassoPointsRef.current = [{ x: canvasPos.x, y: canvasPos.y }];
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              e.preventDefault();
              requestRender();
            }
          } else {
            // Click on empty space
            if (!e.shiftKey) {
              store.clearSelection();
            }
            // Start lasso selection
            isSelectingRef.current = true;
            lassoPointsRef.current = [{ x: canvasPos.x, y: canvasPos.y }];
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            e.preventDefault();
            requestRender();
          }
        }
      }
    },
    [pointerToCanvas, requestRender, commitText],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // ─── Multi-touch pinch handling ──────────────────────────
      if (e.pointerType === "touch" && activeTouchesRef.current.has(e.pointerId)) {
        activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (isPinchingRef.current && activeTouchesRef.current.size === 2) {
          const [a, b] = [...activeTouchesRef.current.values()];
          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

          // Zoom based on distance change
          if (lastPinchDistRef.current > 0) {
            const canvas = canvasRef.current;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              const scale = dist / lastPinchDistRef.current;
              // Convert scale ratio to a delta that the zoom function expects
              const delta = (1 - scale) / 0.001;
              zoom(center.x - rect.left, center.y - rect.top, delta);
            }
          }

          // Pan based on center movement
          const panDx = center.x - lastPinchCenterRef.current.x;
          const panDy = center.y - lastPinchCenterRef.current.y;
          if (Math.abs(panDx) > 0.5 || Math.abs(panDy) > 0.5) {
            pan(panDx, panDy);
          }

          lastPinchDistRef.current = dist;
          lastPinchCenterRef.current = center;
          requestRender();
          return;
        }
      }

      // Panning
      if (isPanningRef.current) {
        const dx = e.clientX - lastPointerRef.current.x;
        const dy = e.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        pan(dx, dy);
        requestRender();
        return;
      }

      // Laser pointer: record trail point (ephemeral)
      if (useToolStore.getState().activeTool === "laser") {
        const canvasPos = pointerToCanvas(e);
        laserTrailRef.current.push({ x: canvasPos.x, y: canvasPos.y, time: performance.now() });
        laserCursorRef.current = { x: canvasPos.x, y: canvasPos.y };
        requestRender();
        // Don't return — allow cursor to update normally
      }

      // Drawing (freehand)
      if (isDrawingRef.current) {
        const canvasPos = pointerToCanvas(e);
        const origin = activeOriginRef.current;
        activePointsRef.current.push({
          x: canvasPos.x - origin.x,
          y: canvasPos.y - origin.y,
          pressure: normalizePressure(e.pressure, e.pointerType),
        });

        // For eraser tool, do hit-test removal in real-time
        if (activeIsEraserRef.current) {
          eraseAtPoint(canvasPos.x, canvasPos.y, activeWidthRef.current);
        }

        requestRender();
        return;
      }

      // Drawing (shape)
      if (isDrawingShapeRef.current && activeShapeRef.current) {
        const canvasPos = pointerToCanvas(e);
        if (useViewportUIStore.getState().snapToGrid) {
          const gs = useViewportUIStore.getState().gridSnapSize;
          const snapped = snapPointToGrid(canvasPos.x, canvasPos.y, gs);
          activeShapeRef.current.currentX = snapped.x;
          activeShapeRef.current.currentY = snapped.y;
        } else {
          activeShapeRef.current.currentX = canvasPos.x;
          activeShapeRef.current.currentY = canvasPos.y;
        }
        requestRender();
      }

      // Drawing text box (drag-to-define)
      if (isDrawingTextRef.current) {
        const canvasPos = pointerToCanvas(e);
        textDrawCurrentRef.current = { x: canvasPos.x, y: canvasPos.y };
        requestRender();
        return;
      }

      // Selection dragging (move)
      if (isDraggingRef.current) {
        const canvasPos = pointerToCanvas(e);
        const dx = canvasPos.x - selectDragStartRef.current.x;
        const dy = canvasPos.y - selectDragStartRef.current.y;
        selectDragStartRef.current = { x: canvasPos.x, y: canvasPos.y };

        const store = useDocumentStore.getState();
        const vpui = useViewportUIStore.getState();

        // Apply raw delta first
        for (const id of store.selectedIds) {
          const el = store.getElementById(id);
          if (el) {
            store.updateElement(id, {
              position: { x: el.position.x + dx, y: el.position.y + dy },
            });
          }
        }

        // Compute snap adjustments
        let snapDx = 0;
        let snapDy = 0;
        activeGuidesRef.current = [];

        const selectedEls = store.board.elements.filter((el) => store.selectedIds.has(el.id));
        const selBounds = getSelectionBounds(selectedEls);

        if (selBounds) {
          // Grid snapping
          if (vpui.snapToGrid) {
            const gridSnap = snapBoundsToGrid(selBounds, vpui.gridSnapSize);
            snapDx += gridSnap.dx;
            snapDy += gridSnap.dy;
          }

          // Smart alignment guides
          if (vpui.showAlignmentGuides) {
            const otherEls = store.board.elements.filter(
              (el) => !store.selectedIds.has(el.id) && el.visible,
            );
            const otherBounds = otherEls.map(getElementBounds);
            const threshold = 5 / viewportRef.current.zoom;
            const adjusted: Bounds = {
              x: selBounds.x + snapDx,
              y: selBounds.y + snapDy,
              width: selBounds.width,
              height: selBounds.height,
            };
            const alignment = computeAlignmentGuides(adjusted, otherBounds, threshold);
            snapDx += alignment.dx;
            snapDy += alignment.dy;
            activeGuidesRef.current = alignment.guides;
          }

          // Apply snap correction
          if (snapDx !== 0 || snapDy !== 0) {
            for (const id of store.selectedIds) {
              const el = store.getElementById(id);
              if (el) {
                store.updateElement(id, {
                  position: { x: el.position.x + snapDx, y: el.position.y + snapDy },
                });
              }
            }
          }
        }

        requestRender();
        return;
      }

      // Resize
      if (isResizingRef.current && resizeOrigBoundsRef.current) {
        const canvasPos = pointerToCanvas(e);
        const origBounds = resizeOrigBoundsRef.current;
        const handle = resizeHandleRef.current!;

        let newX = origBounds.x;
        let newY = origBounds.y;
        let newW = origBounds.width;
        let newH = origBounds.height;

        if (handle === "nw") {
          newX = canvasPos.x;
          newY = canvasPos.y;
          newW = origBounds.x + origBounds.width - canvasPos.x;
          newH = origBounds.y + origBounds.height - canvasPos.y;
        } else if (handle === "ne") {
          newY = canvasPos.y;
          newW = canvasPos.x - origBounds.x;
          newH = origBounds.y + origBounds.height - canvasPos.y;
        } else if (handle === "sw") {
          newX = canvasPos.x;
          newW = origBounds.x + origBounds.width - canvasPos.x;
          newH = canvasPos.y - origBounds.y;
        } else if (handle === "se") {
          newW = canvasPos.x - origBounds.x;
          newH = canvasPos.y - origBounds.y;
        }

        // Clamp minimum size
        if (newW < 4) newW = 4;
        if (newH < 4) newH = 4;

        // Aspect ratio lock when Shift is held
        if (e.shiftKey && origBounds.width > 0 && origBounds.height > 0) {
          const uniformScale = Math.max(newW / origBounds.width, newH / origBounds.height);
          newW = origBounds.width * uniformScale;
          newH = origBounds.height * uniformScale;
          // Adjust position for handles that anchor from the opposite corner
          if (handle === "nw") {
            newX = origBounds.x + origBounds.width - newW;
            newY = origBounds.y + origBounds.height - newH;
          } else if (handle === "ne") {
            newY = origBounds.y + origBounds.height - newH;
          } else if (handle === "sw") {
            newX = origBounds.x + origBounds.width - newW;
          }
        }

        // Snap resize corners to grid
        const vpuiResize = useViewportUIStore.getState();
        if (vpuiResize.snapToGrid) {
          const gs = vpuiResize.gridSnapSize;
          if (handle === "nw") {
            const snapped = snapPointToGrid(newX, newY, gs);
            newW += newX - snapped.x;
            newH += newY - snapped.y;
            newX = snapped.x;
            newY = snapped.y;
          } else if (handle === "ne") {
            const snappedRight = snapPointToGrid(newX + newW, newY, gs);
            newW = snappedRight.x - newX;
            newH += newY - snappedRight.y;
            newY = snappedRight.y;
          } else if (handle === "sw") {
            const snappedBottom = snapPointToGrid(newX, newY + newH, gs);
            newW += newX - snappedBottom.x;
            newX = snappedBottom.x;
            newH = snappedBottom.y - newY;
          } else if (handle === "se") {
            const snapped = snapPointToGrid(newX + newW, newY + newH, gs);
            newW = snapped.x - newX;
            newH = snapped.y - newY;
          }
          if (newW < 4) newW = 4;
          if (newH < 4) newH = 4;
        }

        const scaleX = newW / origBounds.width;
        const scaleY = newH / origBounds.height;

        for (const origEl of resizeOrigElementsRef.current) {
          const relX = origEl.position.x - origBounds.x;
          const relY = origEl.position.y - origBounds.y;
          const newPosX = newX + relX * scaleX;
          const newPosY = newY + relY * scaleY;

          const patch: Record<string, unknown> = {
            position: { x: newPosX, y: newPosY },
          };

          if (
            origEl.type === "rectangle" ||
            origEl.type === "ellipse" ||
            origEl.type === "text" ||
            origEl.type === "image" ||
            origEl.type === "sticky"
          ) {
            patch.size = {
              width: origEl.size.width * scaleX,
              height: origEl.size.height * scaleY,
            };
          } else if (origEl.type === "line" || origEl.type === "arrow") {
            patch.endDelta = {
              x: origEl.endDelta.x * scaleX,
              y: origEl.endDelta.y * scaleY,
            };
          } else if (origEl.type === "freehand") {
            patch.points = origEl.points.map((p: { x: number; y: number; pressure?: number }) => ({
              x: p.x * scaleX,
              y: p.y * scaleY,
              pressure: p.pressure,
            }));
          }

          useDocumentStore.getState().updateElement(origEl.id, patch);
        }
        requestRender();
        return;
      }

      // Lasso selection
      if (isSelectingRef.current) {
        const canvasPos = pointerToCanvas(e);
        lassoPointsRef.current.push({ x: canvasPos.x, y: canvasPos.y });
        requestRender();
        return;
      }

      // Connector tool: track hovered element and anchor
      if (useToolStore.getState().activeTool === "connector") {
        const canvasPos = pointerToCanvas(e);
        connectorCursorRef.current = canvasPos;

        const store = useDocumentStore.getState();
        const elements = store.board.elements;
        let foundEl: CanvasElement | undefined;

        for (let i = elements.length - 1; i >= 0; i--) {
          const el = elements[i];
          if (el.type === "connector" || !el.visible || el.locked) continue;
          if (hitTestElement(el, canvasPos.x, canvasPos.y)) {
            foundEl = el;
            break;
          }
        }

        if (foundEl) {
          connectorHoveredElRef.current = foundEl.id;
          connectorHoveredAnchorRef.current = hitTestAnchor(
            foundEl,
            canvasPos.x,
            canvasPos.y,
            viewportRef.current.zoom,
          );
        } else {
          connectorHoveredElRef.current = null;
          connectorHoveredAnchorRef.current = null;
        }

        requestRender();
      }
    },
    [pan, pointerToCanvas, requestRender],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // ─── Multi-touch cleanup ─────────────────────────────────
      if (e.pointerType === "touch") {
        activeTouchesRef.current.delete(e.pointerId);
        if (isPinchingRef.current) {
          if (activeTouchesRef.current.size < 2) {
            isPinchingRef.current = false;
            lastPinchDistRef.current = 0;
          }
          (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
          return;
        }
      }

      if (isPanningRef.current) {
        isPanningRef.current = false;
        // Restore cursor based on current state
        if (canvasRef.current) {
          if (spaceHeldRef.current || useToolStore.getState().activeTool === "hand") {
            canvasRef.current.style.cursor = "grab";
          } else {
            canvasRef.current.style.cursor = "";
          }
        }
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
        return;
      }

      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);

        // For pen tool, commit the stroke to the document store
        if (!activeIsEraserRef.current) {
          const simplified = simplifyPath(activePointsRef.current, 1.0);

          if (simplified.length > 0) {
            const element: FreehandElement = {
              id: generateId(),
              type: "freehand",
              position: { ...activeOriginRef.current },
              rotation: 0,
              zIndex: 0,
              locked: false,
              visible: true,
              stroke: {
                color: activeColorRef.current,
                width: activeWidthRef.current,
                opacity: activeOpacityRef.current,
              },
              points: simplified,
              isEraser: false,
              isHighlighter: activeIsHighlighterRef.current,
            };
            useDocumentStore.getState().addElements([element]);
          }
        }

        activePointsRef.current = [];
        requestRender();
        return;
      }

      if (isDrawingShapeRef.current && activeShapeRef.current) {
        isDrawingShapeRef.current = false;
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);

        const s = activeShapeRef.current;
        const dx = s.currentX - s.originX;
        const dy = s.currentY - s.originY;

        // Only commit if the user actually dragged
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          useHistoryStore.getState().pushSnapshot();
          const baseProps = {
            id: generateId(),
            rotation: 0,
            zIndex: 0,
            locked: false,
            visible: true,
            stroke: { color: s.strokeColor, width: s.strokeWidth, opacity: s.strokeOpacity },
          };

          let element: RectangleElement | EllipseElement | LineElement | ArrowElement;

          if (s.shapeType === "rectangle") {
            element = {
              ...baseProps,
              type: "rectangle",
              position: { x: Math.min(s.originX, s.currentX), y: Math.min(s.originY, s.currentY) },
              size: { width: Math.abs(dx), height: Math.abs(dy) },
              fill: { color: s.fillColor, opacity: s.fillOpacity },
              cornerRadius: 0,
            };
          } else if (s.shapeType === "ellipse") {
            element = {
              ...baseProps,
              type: "ellipse",
              position: { x: Math.min(s.originX, s.currentX), y: Math.min(s.originY, s.currentY) },
              size: { width: Math.abs(dx), height: Math.abs(dy) },
              fill: { color: s.fillColor, opacity: s.fillOpacity },
            };
          } else if (s.shapeType === "line") {
            element = {
              ...baseProps,
              type: "line",
              position: { x: s.originX, y: s.originY },
              endDelta: { x: dx, y: dy },
            };
          } else {
            element = {
              ...baseProps,
              type: "arrow",
              position: { x: s.originX, y: s.originY },
              endDelta: { x: dx, y: dy },
            };
          }

          useDocumentStore.getState().addElements([element]);
        }

        activeShapeRef.current = null;
        requestRender();
      }

      // Finish drawing text box
      if (isDrawingTextRef.current) {
        isDrawingTextRef.current = false;
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);

        const canvasPos = pointerToCanvas(e);
        const start = textDrawStartRef.current;
        const dx = canvasPos.x - start.x;
        const dy = canvasPos.y - start.y;

        const settings = useSettingsStore.getState();
        const tool = useToolStore.getState();
        const wasDrag = Math.abs(dx) > 10 || Math.abs(dy) > 10;

        textEditRef.current = {
          id: null,
          canvasX: wasDrag ? Math.min(start.x, canvasPos.x) : start.x,
          canvasY: wasDrag ? Math.min(start.y, canvasPos.y) : start.y,
          width: wasDrag ? Math.abs(dx) : null,
          height: wasDrag ? Math.abs(dy) : null,
          fontSize: settings.defaultFontSize,
          fontFamily: settings.defaultFontFamily,
          color: themeAwareStroke(tool.strokeColor),
          bold: tool.bold,
          italic: tool.italic,
          textAlign: "left",
          stickyBg: null,
        };
        setEditingText(true);
        requestAnimationFrame(() => textareaRef.current?.focus());
        requestRender();
        return;
      }

      // Finish moving
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        activeGuidesRef.current = [];
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
        requestRender();
        return;
      }

      // Finish resizing
      if (isResizingRef.current) {
        isResizingRef.current = false;
        resizeHandleRef.current = null;
        resizeOrigBoundsRef.current = null;
        resizeOrigElementsRef.current = [];
        activeGuidesRef.current = [];
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
        requestRender();
        return;
      }

      // Finish lasso selection
      if (isSelectingRef.current) {
        isSelectingRef.current = false;
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);

        const lasso = lassoPointsRef.current;
        if (lasso.length > 2) {
          // Compute lasso bounding box for broad-phase query
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const p of lasso) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }
          const lassoBounds: Bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

          if (lassoBounds.width > 2 || lassoBounds.height > 2) {
            const store = useDocumentStore.getState();
            // Broad-phase: get candidates from spatial index using lasso bounding box
            const regionHits = spatialIndexRef.current.queryRegion(lassoBounds);
            const hits: string[] = [];
            for (const entry of regionHits) {
              const el = store.getElementById(entry.id);
              if (el && el.visible && !el.locked) {
                // Fine-phase: check if element center is inside the lasso polygon
                const eb = entry.bounds;
                const ecx = eb.x + eb.width / 2;
                const ecy = eb.y + eb.height / 2;
                if (pointInPolygon(ecx, ecy, lasso)) {
                  hits.push(el.id);
                }
              }
            }
            if (hits.length > 0) {
              store.select(hits);
            }
          }
        }

        lassoPointsRef.current = [];
        requestRender();
      }
    },
    [pointerToCanvas, requestRender],
  );

  // ─── Wheel event (zoom + trackpad pan) ────────────────────────
  // Attached via addEventListener with { passive: false } to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const rect = canvas.getBoundingClientRect();
        zoom(e.clientX - rect.left, e.clientY - rect.top, e.deltaY);
      } else {
        pan(-e.deltaX, -e.deltaY);
      }
      requestRender();
    };

    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [pan, zoom, requestRender]);

  // ─── Clipboard paste (image from clipboard) ───────────────────
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) continue;
          const dataUrl = await fileToDataUrl(blob);
          const center = useViewportUIStore.getState().getViewportCenter();
          await insertImageElement(dataUrl, center);
          requestRender();
          return;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [requestRender]);

  // ─── Context menu (right-click) ───────────────────────────────
  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const canvasPos = screenToCanvas(
        e.clientX - rect.left,
        e.clientY - rect.top,
        viewportRef.current,
      );

      const store = useDocumentStore.getState();
      // Check if right-clicked on a selected element
      const elements = store.board.elements;
      let clickedSelected = false;
      // Check reverse z-order (top first)
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (!el.visible) continue;
        const hit = el.type === "connector"
          ? hitTestConnector(el, elements, canvasPos.x, canvasPos.y)
          : hitTestElement(el, canvasPos.x, canvasPos.y);
        if (hit) {
          if (store.selectedIds.has(el.id)) {
            clickedSelected = true;
          } else {
            // Right-clicked on a non-selected element — select it
            store.clearSelection();
            store.select([el.id]);
            clickedSelected = true;
            requestRender();
          }
          break;
        }
      }

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target: clickedSelected ? "element" : "background",
      });
    },
    [viewportRef, requestRender],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const zoomToFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const elements = useDocumentStore.getState().board.elements;
    if (elements.length === 0) return;

    // Compute bounding box of all elements
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

    const rect = canvas.getBoundingClientRect();
    const padding = 60;
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;
    const contentW = maxX - minX;
    const contentH = maxY - minY;

    if (contentW <= 0 || contentH <= 0) return;

    const fitZoom = Math.min(
      availW / contentW,
      availH / contentH,
      MAX_ZOOM,
    );
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(fitZoom, MAX_ZOOM));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    viewportRef.current = {
      zoom: clampedZoom,
      offsetX: rect.width / 2 - centerX * clampedZoom,
      offsetY: rect.height / 2 - centerY * clampedZoom,
    };
    needsRenderRef.current = true;
  }, [viewportRef]);

  // ─── Drag-and-drop (image files from OS) ──────────────────────
  const onDragOver = useCallback((e: React.DragEvent<HTMLCanvasElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const dropPos = screenToCanvas(
        e.clientX - rect.left,
        e.clientY - rect.top,
        viewportRef.current,
      );

      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const dataUrl = await fileToDataUrl(file);
        await insertImageElement(dataUrl, dropPos);
        // Offset subsequent images so they don't stack exactly
        dropPos.x += 20;
        dropPos.y += 20;
      }
      requestRender();
    },
    [viewportRef, requestRender],
  );

  // ─── Keyboard: space held for pan mode, Delete/Backspace ───────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        if (document.activeElement?.tagName === "TEXTAREA") return;
        e.preventDefault();
        spaceHeldRef.current = true;
        // Save the previous tool so we can restore it on Space release
        if (!previousToolRef.current) {
          previousToolRef.current = useToolStore.getState().activeTool;
        }
        if (canvasRef.current) canvasRef.current.style.cursor = "grab";
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          document.activeElement?.tagName === "TEXTAREA" ||
          document.activeElement?.tagName === "INPUT"
        )
          return;
        const store = useDocumentStore.getState();
        if (store.selectedIds.size > 0) {
          e.preventDefault();
          useHistoryStore.getState().pushSnapshot();
          store.removeElements([...store.selectedIds]);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        previousToolRef.current = null;
        // Restore cursor based on active tool
        if (canvasRef.current) {
          if (useToolStore.getState().activeTool === "hand") {
            canvasRef.current.style.cursor = "grab";
          } else {
            canvasRef.current.style.cursor = "";
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ─── Update cursor when active tool changes ───────────────────
  useEffect(() => {
    const unsub = useToolStore.subscribe((state) => {
      if (!canvasRef.current || isPanningRef.current || spaceHeldRef.current) return;
      canvasRef.current.style.cursor = state.activeTool === "hand" ? "grab" : state.activeTool === "laser" ? "none" : "";
      // Clear connector state when switching away from connector tool
      if (state.activeTool !== "connector") {
        connectorSourceRef.current = null;
        connectorHoveredElRef.current = null;
        connectorHoveredAnchorRef.current = null;
        needsRenderRef.current = true;
      }
      // Clear laser trail when switching away from laser tool
      if (state.activeTool !== "laser") {
        laserTrailRef.current = [];
        laserCursorRef.current = null;
        needsRenderRef.current = true;
      }
    });
    // Set initial cursor
    if (canvasRef.current) {
      const initTool = useToolStore.getState().activeTool;
      canvasRef.current.style.cursor = initTool === "hand" ? "grab" : initTool === "laser" ? "none" : "";
    }
    return unsub;
  }, []);

  // ─── Rerender when store changes ──────────────────────────────
  useEffect(() => {
    const unsub = useDocumentStore.subscribe(() => {
      requestRender();
    });
    return unsub;
  }, [requestRender]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={closeContextMenu}
          onZoomToFit={zoomToFit}
          requestRender={requestRender}
        />
      )}
      {editingText &&
        textEditRef.current &&
        (() => {
          const te = textEditRef.current!;
          const initScreen = canvasToScreen(te.canvasX, te.canvasY, viewportRef.current);
          return (
            <div
              ref={textContainerRef}
              style={{
                position: "absolute",
                left: initScreen.x,
                top: initScreen.y,
                zIndex: 10,
              }}
            >
              {/* Formatting toolbar */}
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: 0,
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  padding: "4px 6px",
                  borderRadius: 8,
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  whiteSpace: "nowrap",
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (textEditRef.current) {
                      textEditRef.current.bold = !textEditRef.current.bold;
                      requestRender();
                      handleTextInput();
                    }
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: 14,
                    backgroundColor: textEditRef.current.bold ? "var(--accent)" : "transparent",
                    color: textEditRef.current.bold ? "#fff" : "var(--text-primary)",
                  }}
                >
                  B
                </button>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (textEditRef.current) {
                      textEditRef.current.italic = !textEditRef.current.italic;
                      requestRender();
                      handleTextInput();
                    }
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontStyle: "italic",
                    fontSize: 14,
                    fontWeight: 500,
                    backgroundColor: textEditRef.current.italic ? "var(--accent)" : "transparent",
                    color: textEditRef.current.italic ? "#fff" : "var(--text-primary)",
                  }}
                >
                  I
                </button>
                <div
                  style={{
                    width: 1,
                    height: 20,
                    backgroundColor: "var(--border)",
                    margin: "0 4px",
                  }}
                />
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (textEditRef.current && textEditRef.current.fontSize > 8) {
                      textEditRef.current.fontSize -= 2;
                      requestRender();
                      handleTextInput();
                    }
                  }}
                  style={{
                    width: 24,
                    height: 28,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 16,
                    fontWeight: 600,
                    backgroundColor: "transparent",
                    color: "var(--text-primary)",
                  }}
                >
                  −
                </button>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    minWidth: 24,
                    textAlign: "center",
                    userSelect: "none",
                  }}
                >
                  {textEditRef.current.fontSize}
                </span>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (textEditRef.current && textEditRef.current.fontSize < 128) {
                      textEditRef.current.fontSize += 2;
                      requestRender();
                      handleTextInput();
                    }
                  }}
                  style={{
                    width: 24,
                    height: 28,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 16,
                    fontWeight: 600,
                    backgroundColor: "transparent",
                    color: "var(--text-primary)",
                  }}
                >
                  +
                </button>
              </div>
              <textarea
                ref={textareaRef}
                style={{
                  background: te.stickyBg ?? "transparent",
                  border: te.stickyBg ? "none" : "1.5px dashed #3b82f6",
                  borderRadius: te.stickyBg ? 6 : 0,
                  boxShadow: te.stickyBg ? "2px 3px 8px rgba(0,0,0,0.15)" : "none",
                  outline: "none",
                  resize: "both",
                  overflow: "hidden",
                  padding: te.stickyBg ? 10 : "2px 4px",
                  margin: 0,
                  whiteSpace: te.width !== null ? "pre-wrap" : "pre",
                  wordBreak: te.width !== null ? "break-word" : "normal",
                  lineHeight: 1.3,
                  fontFamily: te.fontFamily,
                  fontWeight: te.bold ? "bold" : "normal",
                  fontStyle: te.italic ? "italic" : "normal",
                  color: te.color,
                  caretColor: te.color,
                  minWidth: "20px",
                  minHeight: `${te.fontSize * viewportRef.current.zoom * 1.3}px`,
                  width: te.width !== null ? `${te.width * viewportRef.current.zoom}px` : undefined,
                }}
                onBlur={commitText}
                onInput={handleTextInput}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    if (textEditRef.current?.id) {
                      textEditRef.current = null;
                    } else {
                      textEditRef.current = null;
                    }
                    setEditingText(false);
                    requestRender();
                    return;
                  }
                  if (e.ctrlKey && e.key === "b") {
                    e.preventDefault();
                    if (textEditRef.current) {
                      textEditRef.current.bold = !textEditRef.current.bold;
                      requestRender();
                      handleTextInput();
                    }
                    return;
                  }
                  if (e.ctrlKey && e.key === "i") {
                    e.preventDefault();
                    if (textEditRef.current) {
                      textEditRef.current.italic = !textEditRef.current.italic;
                      requestRender();
                      handleTextInput();
                    }
                    return;
                  }
                  e.stopPropagation();
                }}
              />
            </div>
          );
        })()}
      {/* Selection action bar */}
      <div
        ref={selectionBarRef}
        style={{
          position: "absolute",
          display: "none",
          transform: "translateX(-50%)",
          zIndex: 20,
          alignItems: "center",
          gap: 2,
          padding: "4px 6px",
          borderRadius: 8,
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
          pointerEvents: "auto",
        }}
      >
        <button
          title="Duplicate (Ctrl+D)"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const store = useDocumentStore.getState();
            if (store.selectedIds.size === 0) return;
            useHistoryStore.getState().pushSnapshot();
            const selectedEls = store.board.elements.filter((el) => store.selectedIds.has(el.id));
            const newEls = selectedEls.map((el) => ({
              ...structuredClone(el),
              id: generateId(),
              position: { x: el.position.x + 20, y: el.position.y + 20 },
            }));
            store.addElements(newEls);
            store.clearSelection();
            store.select(newEls.map((el) => el.id));
            requestRender();
          }}
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <button
          title="Copy (Ctrl+C)"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const store = useDocumentStore.getState();
            if (store.selectedIds.size === 0) return;
            // Copy to system clipboard as text (JSON)
            const selectedEls = store.board.elements.filter((el) => store.selectedIds.has(el.id));
            const json = JSON.stringify(selectedEls);
            navigator.clipboard.writeText(json).catch(() => {});
          }}
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
        </button>
        <div style={{ width: 1, height: 20, backgroundColor: "var(--border)" }} />
        <button
          title="Bring Forward (Ctrl+])"  
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const store = useDocumentStore.getState();
            if (store.selectedIds.size === 0) return;
            useHistoryStore.getState().pushSnapshot();
            store.bringForward([...store.selectedIds]);
            requestRender();
          }}
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          title="Send Backward (Ctrl+[)"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const store = useDocumentStore.getState();
            if (store.selectedIds.size === 0) return;
            useHistoryStore.getState().pushSnapshot();
            store.sendBackward([...store.selectedIds]);
            requestRender();
          }}
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div style={{ width: 1, height: 20, backgroundColor: "var(--border)" }} />
        <button
          title="Delete (Del)"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const store = useDocumentStore.getState();
            if (store.selectedIds.size === 0) return;
            useHistoryStore.getState().pushSnapshot();
            store.removeElements([...store.selectedIds]);
            requestRender();
          }}
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Point-in-polygon (ray-casting algorithm) ────────────────────

/** Test if a point is inside a polygon defined by an array of vertices. */
function pointInPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Eraser hit-testing ───────────────────────────────────────────

/**
 * Find and remove elements whose strokes/bounds intersect
 * a circle at the given canvas-space position.
 * Works on all element types (freehand, rectangles, shapes, text, etc.).
 */
function eraseAtPoint(cx: number, cy: number, radius: number): void {
  const { board, removeElements } = useDocumentStore.getState();
  const hitIds: string[] = [];

  for (const el of board.elements) {
    if (!el.visible || el.locked) continue;
    if (el.type === "freehand") {
      if (hitTestFreehand(el, cx, cy, radius)) {
        hitIds.push(el.id);
      }
    } else if (el.type === "connector") {
      if (hitTestConnector(el, board.elements, cx, cy)) {
        hitIds.push(el.id);
      }
    } else {
      // For shapes/text/lines: use generic hit test with eraser radius
      if (hitTestElement(el, cx, cy)) {
        hitIds.push(el.id);
      }
    }
  }

  if (hitIds.length > 0) {
    removeElements(hitIds);
  }
}

/**
 * Check if any segment of a freehand path comes within `radius`
 * of the point (cx, cy) in canvas space.
 */
function hitTestFreehand(el: FreehandElement, cx: number, cy: number, radius: number): boolean {
  const { position, points, stroke } = el;
  // Effective hit distance = eraser radius + half the stroke width
  const threshold = radius / 2 + stroke.width / 2;
  const thresholdSq = threshold * threshold;

  for (let i = 0; i < points.length; i++) {
    const px = position.x + points[i].x;
    const py = position.y + points[i].y;

    // Point-to-point distance check
    const dx = cx - px;
    const dy = cy - py;
    if (dx * dx + dy * dy <= thresholdSq) return true;

    // Segment distance check
    if (i > 0) {
      const prevX = position.x + points[i - 1].x;
      const prevY = position.y + points[i - 1].y;
      if (distToSegmentSq(cx, cy, prevX, prevY, px, py) <= thresholdSq) {
        return true;
      }
    }
  }
  return false;
}

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by). */
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
