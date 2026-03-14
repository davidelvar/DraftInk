import { useCallback, useEffect, useState } from "react";
import InfiniteCanvas from "./canvas/InfiniteCanvas";
import UndoToast from "./components/UndoToast";
import Toolbar from "./components/Toolbar";
import TopBar from "./components/TopBar";
import BoardPanel from "./components/BoardPanel";
import ShortcutsOverlay from "./components/ShortcutsOverlay";
import SearchPanel from "./components/SearchPanel";
import Minimap from "./components/Minimap";
import PresentationControls from "./components/PresentationControls";
import HomeScreen from "./components/HomeScreen";
import UpdateChecker from "./components/UpdateChecker";
import { useViewportUIStore } from "./store/viewportUIStore";
import { initDirtyTracking, useFileStore } from "./store/fileStore";
import { useThemeStore } from "./store/themeStore";
import { useBoardStore } from "./store/boardStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTrayEvents } from "./hooks/useTrayEvents";

function App() {
  const zoom = useViewportUIStore((s) => s.zoom);
  const zoomBy = useViewportUIStore((s) => s.zoomBy);
  const resetZoom = useViewportUIStore((s) => s.resetZoom);
  const presentationMode = useViewportUIStore((s) => s.presentationMode);
  const resolved = useThemeStore((s) => s.resolved);

  const [showHome, setShowHome] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const toggleHelp = useCallback(() => setShowHelp((v) => !v), []);

  // Centralized keyboard shortcut handler
  useKeyboardShortcuts(toggleHelp);

  // System tray event handlers (new board, open recent)
  const showBoard = useCallback(() => setShowHome(false), []);
  useTrayEvents(showBoard);

  useEffect(() => {
    initDirtyTracking();
  }, []);

  // Autosave every 5 seconds when dirty (app-level, always active)
  // If no board file exists yet, auto-create one first
  useEffect(() => {
    const interval = setInterval(async () => {
      const { activeBoardId, saveCurrentBoard, createBoard } = useBoardStore.getState();
      const { dirty } = useFileStore.getState();
      if (!dirty) return;

      if (activeBoardId) {
        saveCurrentBoard().catch(console.error);
      } else {
        // Auto-create a board file for the current content
        try {
          await createBoard();
        } catch {
          // ignore creation errors
        }
      }
    }, 5_000);
    return () => clearInterval(interval);
  }, []);

  // Apply resolved theme to document root for CSS variable switching
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  if (showHome) {
    return (
      <div className="relative h-full w-full">
        <HomeScreen onEnterBoard={() => setShowHome(false)} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Canvas area */}
      <InfiniteCanvas />

      {/* Presentation mode: show only floating controls */}
      {presentationMode && <PresentationControls />}

      {/* All UI chrome hidden during presentation */}
      {!presentationMode && (
        <>
          {/* Board switcher strip — full width, above everything */}
          <BoardPanel />

          {/* Top action bar (file, undo/redo, zoom, theme) */}
          <TopBar
            zoom={zoom}
            onZoom={zoomBy}
            onResetZoom={resetZoom}
            onGoHome={() => {
              // Save current board before going home
              const { activeBoardId, saveCurrentBoard } = useBoardStore.getState();
              if (activeBoardId) {
                saveCurrentBoard().catch(console.error);
              }
              setShowHome(true);
            }}
          />

          {/* Drawing tools sidebar */}
          <Toolbar />

          <UndoToast />

          <Minimap />

          <ShortcutsOverlay open={showHelp} onClose={() => setShowHelp(false)} />

          <SearchPanel />

          <UpdateChecker />
        </>
      )}
    </div>
  );
}

export default App;
