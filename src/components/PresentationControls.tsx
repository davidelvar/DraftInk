import { useCallback, useEffect, useRef, useState } from "react";
import { useViewportUIStore } from "../store/viewportUIStore";
import { useBoardStore } from "../store/boardStore";
import { useToolStore } from "../store/toolStore";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Pointer,
} from "lucide-react";

const AUTO_HIDE_MS = 2000;
const EDGE_THRESHOLD = 40; // px from screen edge to reveal bar

export default function PresentationControls() {
  const exitPresentationMode = useViewportUIStore((s) => s.exitPresentationMode);
  const prePresentationTool = useViewportUIStore((s) => s.prePresentationTool);
  const zoomBy = useViewportUIStore((s) => s.zoomBy);
  const boards = useBoardStore((s) => s.boards);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const activeTool = useToolStore((s) => s.activeTool);

  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const resetHideTimer = useCallback(() => {
    setVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, []);

  // Start auto-hide timer on mount
  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(hideTimerRef.current);
  }, []);

  // Show on mouse move near bottom edge
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY > window.innerHeight - EDGE_THRESHOLD) {
        resetHideTimer();
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [resetHideTimer]);

  const handleExit = useCallback(() => {
    exitPresentationMode();
    if (prePresentationTool) {
      useToolStore.getState().setTool(prePresentationTool as any);
    }
  }, [exitPresentationMode, prePresentationTool]);

  const activeIdx = boards.findIndex((b) => b.id === activeBoardId);
  const hasPrev = activeIdx > 0;
  const hasNext = activeIdx >= 0 && activeIdx < boards.length - 1;

  const goToPrev = useCallback(async () => {
    if (!hasPrev) return;
    await useBoardStore.getState().switchBoard(boards[activeIdx - 1].id);
  }, [boards, activeIdx, hasPrev]);

  const goToNext = useCallback(async () => {
    if (!hasNext) return;
    await useBoardStore.getState().switchBoard(boards[activeIdx + 1].id);
  }, [boards, activeIdx, hasNext]);

  const toggleLaser = useCallback(() => {
    const store = useToolStore.getState();
    if (store.activeTool === "laser") {
      store.setTool("hand");
    } else {
      store.setTool("laser");
    }
  }, []);

  const isLaser = activeTool === "laser";

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-2 shadow-lg transition-opacity duration-300 ${
        visible ? "opacity-90" : "pointer-events-none opacity-0"
      }`}
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onMouseEnter={resetHideTimer}
    >
      {/* Prev / Next board */}
      <button
        onClick={goToPrev}
        disabled={!hasPrev}
        className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
        title="Previous board"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="min-w-[3ch] text-center text-xs text-white/80">
        {activeIdx >= 0 ? `${activeIdx + 1}/${boards.length}` : "–"}
      </span>
      <button
        onClick={goToNext}
        disabled={!hasNext}
        className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
        title="Next board"
      >
        <ChevronRight size={18} />
      </button>

      <div className="mx-1 h-5 w-px bg-white/30" />

      {/* Zoom */}
      <button
        onClick={() => zoomBy(200)}
        className="rounded p-1 text-white hover:bg-white/20"
        title="Zoom out"
      >
        <ZoomOut size={18} />
      </button>
      <button
        onClick={() => zoomBy(-200)}
        className="rounded p-1 text-white hover:bg-white/20"
        title="Zoom in"
      >
        <ZoomIn size={18} />
      </button>

      <div className="mx-1 h-5 w-px bg-white/30" />

      {/* Laser toggle */}
      <button
        onClick={toggleLaser}
        className={`rounded p-1 text-white hover:bg-white/20 ${isLaser ? "bg-red-600/60" : ""}`}
        title="Laser pointer"
      >
        <Pointer size={18} />
      </button>

      <div className="mx-1 h-5 w-px bg-white/30" />

      {/* Exit */}
      <button
        onClick={handleExit}
        className="rounded p-1 text-white hover:bg-white/20"
        title="Exit presentation (Esc)"
      >
        <X size={18} />
      </button>
    </div>
  );
}
