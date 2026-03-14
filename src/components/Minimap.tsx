import { useCallback, useEffect, useRef } from "react";
import { useDocumentStore } from "../store/documentStore";
import { useViewportUIStore } from "../store/viewportUIStore";
import { useThemeStore } from "../store/themeStore";
import { renderElements } from "../canvas/renderElements";
import { Map, X } from "lucide-react";
import type { CanvasElement, Bounds } from "../types/document";

const MINIMAP_W = 200;
const MINIMAP_H = 150;

/** Compute bounding box of all elements. Returns null if empty. */
function getContentBounds(elements: CanvasElement[]): Bounds | null {
  if (elements.length === 0) return null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const el of elements) {
    const px = el.position.x;
    const py = el.position.y;

    if ("size" in el && el.size) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px + el.size.width);
      maxY = Math.max(maxY, py + el.size.height);
    } else if ("endDelta" in el && el.endDelta) {
      const ex = px + el.endDelta.x;
      const ey = py + el.endDelta.y;
      minX = Math.min(minX, px, ex);
      minY = Math.min(minY, py, ey);
      maxX = Math.max(maxX, px, ex);
      maxY = Math.max(maxY, py, ey);
    } else if ("points" in el && el.points) {
      for (const p of el.points) {
        minX = Math.min(minX, px + p.x);
        minY = Math.min(minY, py + p.y);
        maxX = Math.max(maxX, px + p.x);
        maxY = Math.max(maxY, py + p.y);
      }
    } else {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px + 50);
      maxY = Math.max(maxY, py + 50);
    }
  }

  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX || 1, height: maxY - minY || 1 };
}

export default function Minimap() {
  const showMinimap = useViewportUIStore((s) => s.showMinimap);
  const toggleMinimap = useViewportUIStore((s) => s.toggleMinimap);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const rafIdRef = useRef(0);
  // Cache the world-to-minimap transform for pointer interaction
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  // dirty flag — set when elements change
  const elementsVersionRef = useRef<CanvasElement[] | null>(null);
  // offscreen buffer for element rendering (re-used across frames)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenDirtyRef = useRef(true);

  // ---------- Render loop ----------
  useEffect(() => {
    if (!showMinimap) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Ensure offscreen buffer exists
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement("canvas");
      offscreenRef.current.width = MINIMAP_W * 2;
      offscreenRef.current.height = MINIMAP_H * 2;
    }
    const offscreen = offscreenRef.current;
    const offCtx = offscreen.getContext("2d")!;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_W * dpr;
    canvas.height = MINIMAP_H * dpr;

    // Mark elements dirty when store changes
    const unsubElements = useDocumentStore.subscribe(() => {
      offscreenDirtyRef.current = true;
    });

    const frame = () => {
      rafIdRef.current = requestAnimationFrame(frame);

      const elements = useDocumentStore.getState().board.elements;
      const isDark = useThemeStore.getState().resolved === "dark";
      const viewport = useViewportUIStore.getState().getViewport();
      const canvasSize = useViewportUIStore.getState().getCanvasSize();

      // Check if elements reference changed (dirty flag)
      if (elements !== elementsVersionRef.current) {
        elementsVersionRef.current = elements;
        offscreenDirtyRef.current = true;
      }

      const contentBounds = getContentBounds(elements);

      // Compute world bounds = union of content bounds and viewport bounds
      const vpLeft = -viewport.offsetX / viewport.zoom;
      const vpTop = -viewport.offsetY / viewport.zoom;
      const vpRight = vpLeft + canvasSize.width / viewport.zoom;
      const vpBottom = vpTop + canvasSize.height / viewport.zoom;

      let worldMinX: number, worldMinY: number, worldMaxX: number, worldMaxY: number;
      if (contentBounds) {
        worldMinX = Math.min(contentBounds.x, vpLeft);
        worldMinY = Math.min(contentBounds.y, vpTop);
        worldMaxX = Math.max(contentBounds.x + contentBounds.width, vpRight);
        worldMaxY = Math.max(contentBounds.y + contentBounds.height, vpBottom);
      } else {
        worldMinX = vpLeft;
        worldMinY = vpTop;
        worldMaxX = vpRight;
        worldMaxY = vpBottom;
      }

      // Add padding
      const worldW = worldMaxX - worldMinX || 1;
      const worldH = worldMaxY - worldMinY || 1;
      const padFactor = 0.1;
      worldMinX -= worldW * padFactor;
      worldMinY -= worldH * padFactor;
      const totalW = worldW * (1 + 2 * padFactor);
      const totalH = worldH * (1 + 2 * padFactor);

      // Fit world into minimap
      const scaleX = MINIMAP_W / totalW;
      const scaleY = MINIMAP_H / totalH;
      const scale = Math.min(scaleX, scaleY);
      const drawW = totalW * scale;
      const drawH = totalH * scale;
      const ox = (MINIMAP_W - drawW) / 2;
      const oy = (MINIMAP_H - drawH) / 2;

      // Store transform for pointer interaction
      transformRef.current = {
        scale,
        offsetX: ox - worldMinX * scale,
        offsetY: oy - worldMinY * scale,
      };

      // -- Re-render offscreen buffer if dirty --
      if (offscreenDirtyRef.current && elements.length > 0) {
        offscreenDirtyRef.current = false;
        offscreen.width = MINIMAP_W * 2;
        offscreen.height = MINIMAP_H * 2;
        offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
        offCtx.save();
        offCtx.scale(2, 2); // 2x for crispness
        offCtx.translate(ox - worldMinX * scale, oy - worldMinY * scale);
        offCtx.scale(scale, scale);
        renderElements(offCtx, elements, undefined, scale);
        offCtx.restore();
      }

      // -- Draw to visible canvas --
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = isDark ? "#1f2937" : "#f3f4f6";
      ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

      // Draw element content from offscreen buffer
      if (elements.length > 0) {
        ctx.drawImage(
          offscreen,
          0,
          0,
          offscreen.width,
          offscreen.height,
          0,
          0,
          MINIMAP_W,
          MINIMAP_H,
        );
      }

      // Draw viewport rectangle
      const vx = vpLeft * scale + transformRef.current.offsetX;
      const vy = vpTop * scale + transformRef.current.offsetY;
      const vw = (canvasSize.width / viewport.zoom) * scale;
      const vh = (canvasSize.height / viewport.zoom) * scale;

      ctx.strokeStyle = isDark ? "#60a5fa" : "#3b82f6";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx, vy, vw, vh);
      ctx.fillStyle = isDark ? "rgba(96,165,250,0.08)" : "rgba(59,130,246,0.08)";
      ctx.fillRect(vx, vy, vw, vh);
    };

    rafIdRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      unsubElements();
    };
  }, [showMinimap]);

  // ---------- Pointer interaction: click/drag to pan ----------
  const minimapToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const t = transformRef.current;
    const canvasX = (mx - t.offsetX) / t.scale;
    const canvasY = (my - t.offsetY) / t.scale;
    return { x: canvasX, y: canvasY };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const pt = minimapToCanvas(e.clientX, e.clientY);
      if (pt) useViewportUIStore.getState().panTo(pt.x, pt.y);
    },
    [minimapToCanvas],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      const pt = minimapToCanvas(e.clientX, e.clientY);
      if (pt) useViewportUIStore.getState().panTo(pt.x, pt.y);
    },
    [minimapToCanvas],
  );

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  if (!showMinimap) {
    return (
      <button
        onClick={toggleMinimap}
        className="absolute bottom-12 right-3 z-40 flex h-11 w-11 items-center justify-center rounded-xl shadow-lg transition-colors"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor =
            "color-mix(in srgb, var(--text-primary) 8%, var(--bg-secondary))";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
        }}
        aria-label="Show minimap"
      >
        <Map size={18} />
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-12 right-3 z-40 overflow-hidden rounded-xl shadow-lg"
      style={{
        width: MINIMAP_W,
        border: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          className="flex items-center gap-1.5 text-[11px] font-semibold select-none"
          style={{ color: "var(--text-secondary)" }}
        >
          <Map size={12} />
          Minimap
        </span>
        <button
          onClick={toggleMinimap}
          className="flex h-6 w-6 items-center justify-center rounded transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--text-primary) 10%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Hide minimap"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          width: MINIMAP_W,
          height: MINIMAP_H,
          display: "block",
          cursor: "crosshair",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
