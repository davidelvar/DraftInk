import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import type { Board } from "../types/document";
import { FORMAT_VERSION } from "../types/document";
import { useDocumentStore } from "./documentStore";
import { useHistoryStore } from "./historyStore";

export interface FileState {
  /** Path of the currently open file, or null for a new unsaved board. */
  currentFilePath: string | null;
  /** Whether the board has unsaved changes. */
  dirty: boolean;

  setDirty: (dirty: boolean) => void;
  setCurrentFilePath: (path: string | null) => void;

  /** Create a new empty board, prompting to save if dirty. */
  newFile: () => Promise<void>;
  /** Open a .inkboard file via native dialog. */
  openFile: () => Promise<void>;
  /** Save to current path, or prompt Save As if no path. */
  saveFile: () => Promise<void>;
  /** Always prompt for a new path via native dialog. */
  saveFileAs: () => Promise<void>;
}

const INKBOARD_FILTER = {
  name: "InkBoard",
  extensions: ["inkboard"],
};

export const useFileStore = create<FileState>()((set, get) => ({
  currentFilePath: null,
  dirty: false,

  setDirty: (dirty) => set({ dirty }),
  setCurrentFilePath: (path) => set({ currentFilePath: path }),

  newFile: async () => {
    const { dirty } = get();
    if (dirty) {
      const shouldContinue = window.confirm("You have unsaved changes. Create a new board anyway?");
      if (!shouldContinue) return;
    }

    useDocumentStore.getState().newBoard();
    useHistoryStore.getState().clearHistory();
    set({ currentFilePath: null, dirty: false });
    updateWindowTitle(null);
  },

  openFile: async () => {
    const { dirty } = get();
    if (dirty) {
      const shouldContinue = window.confirm(
        "You have unsaved changes. Open a different file anyway?",
      );
      if (!shouldContinue) return;
    }

    const selected = await open({
      multiple: false,
      filters: [INKBOARD_FILTER],
      title: "Open Board",
    });

    if (!selected) return; // user cancelled

    const filePath = selected as string;

    try {
      const contents: string = await invoke("read_file_contents", { path: filePath });
      const board: Board = JSON.parse(contents);

      // Basic validation
      if (!board.metadata || !Array.isArray(board.elements)) {
        throw new Error("Invalid .inkboard file format");
      }

      useDocumentStore.getState().loadBoard(board);
      useHistoryStore.getState().clearHistory();
      set({ currentFilePath: filePath, dirty: false });
      updateWindowTitle(filePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to open file:\n${msg}`);
    }
  },

  saveFile: async () => {
    const { currentFilePath } = get();
    if (currentFilePath) {
      await writeBoardToPath(currentFilePath);
      set({ dirty: false });
    } else {
      await get().saveFileAs();
    }
  },

  saveFileAs: async () => {
    const selected = await save({
      filters: [INKBOARD_FILTER],
      title: "Save Board As",
      defaultPath: getDefaultFileName(),
    });

    if (!selected) return; // user cancelled

    let filePath = selected;
    // Ensure .inkboard extension
    if (!filePath.toLowerCase().endsWith(".inkboard")) {
      filePath += ".inkboard";
    }

    await writeBoardToPath(filePath);
    set({ currentFilePath: filePath, dirty: false });
    updateWindowTitle(filePath);
  },
}));

/** Serialize the current board and write it to disk via Tauri command. */
async function writeBoardToPath(path: string): Promise<void> {
  const board = useDocumentStore.getState().board;
  // Ensure format version and updated timestamp
  const toSave: Board = {
    ...board,
    metadata: {
      ...board.metadata,
      formatVersion: FORMAT_VERSION,
      updatedAt: new Date().toISOString(),
    },
  };

  const json = JSON.stringify(toSave, null, 2);

  try {
    await invoke("write_file", { path, contents: json });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    window.alert(`Failed to save file:\n${msg}`);
    throw err;
  }
}

function getDefaultFileName(): string {
  const name = useDocumentStore.getState().board.metadata.name || "Untitled";
  return `${name}.inkboard`;
}

function updateWindowTitle(filePath: string | null) {
  const name = filePath ? (filePath.split(/[\\/]/).pop() ?? "DraftInk") : "DraftInk — Untitled";
  document.title = name.replace(".inkboard", "") + " — DraftInk";
}

// ─── Track dirty state on document mutations ────────────────────

let _initializedDirtyTracking = false;

export function initDirtyTracking() {
  if (_initializedDirtyTracking) return;
  _initializedDirtyTracking = true;

  useDocumentStore.subscribe((state, prevState) => {
    if (state.board !== prevState.board) {
      useFileStore.setState({ dirty: true });
    }
  });
}
