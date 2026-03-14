import { useEffect } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { useBoardStore } from "../store/boardStore";

/**
 * Listen for system tray menu events emitted from the Rust backend
 * and dispatch the corresponding actions to the frontend stores.
 *
 * @param onShowBoard - callback to navigate from home screen to the board view
 */
export function useTrayEvents(onShowBoard: () => void) {
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    // "New Board" tray action
    listen("tray-new-board", async () => {
      const { createBoard } = useBoardStore.getState();
      try {
        await createBoard();
        onShowBoard();
      } catch (err) {
        console.error("Tray: failed to create board", err);
      }
    }).then((u) => unlisteners.push(u));

    // "Open Recent > <board>" tray action — payload is the board file path
    listen<string>("tray-open-board", async (event) => {
      const filePath = event.payload;
      const { boards, refreshBoards, switchBoard } = useBoardStore.getState();

      // Make sure we have the latest board list
      if (boards.length === 0) {
        await refreshBoards();
      }

      const entry = useBoardStore.getState().boards.find((b) => b.filePath === filePath);
      if (entry) {
        await switchBoard(entry.id);
        onShowBoard();
      } else {
        console.warn("Tray: board not found for path", filePath);
      }
    }).then((u) => unlisteners.push(u));

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [onShowBoard]);
}

/** Ask the Rust backend to rebuild the tray's "Open Recent" submenu. */
export function refreshTrayMenu() {
  emit("refresh-tray-menu").catch(() => {
    // Silently ignore — may not be running in Tauri context (e.g. tests)
  });
}
