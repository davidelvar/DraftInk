import { useCallback, useRef } from "react";
import { type Viewport, createViewport, zoomAtPoint } from "./viewport";

/**
 * Hook that owns the viewport state and provides mutation methods.
 * Uses a ref (not React state) to avoid re-renders on every frame —
 * the render loop reads the ref directly.
 */
export function useViewport() {
  const viewportRef = useRef<Viewport>(createViewport());

  const pan = useCallback((dx: number, dy: number) => {
    const v = viewportRef.current;
    viewportRef.current = {
      ...v,
      offsetX: v.offsetX + dx,
      offsetY: v.offsetY + dy,
    };
  }, []);

  const zoom = useCallback((screenX: number, screenY: number, delta: number) => {
    viewportRef.current = zoomAtPoint(viewportRef.current, screenX, screenY, delta);
  }, []);

  const resetView = useCallback(() => {
    viewportRef.current = createViewport();
  }, []);

  return { viewportRef, pan, zoom, resetView };
}
