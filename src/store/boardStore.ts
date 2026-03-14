import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Board, CanvasElement } from "../types/document";
import { FORMAT_VERSION, createEmptyBoard } from "../types/document";
import { useDocumentStore } from "./documentStore";
import { useHistoryStore } from "./historyStore";
import { useFileStore } from "./fileStore";
import { useViewportUIStore } from "./viewportUIStore";
import { generateId } from "../utils/id";
import { refreshTrayMenu } from "../hooks/useTrayEvents";

// ─── Types ──────────────────────────────────────────────────────

export interface BoardEntry {
  id: string;
  name: string;
  filePath: string;
  lastModified: number; // unix seconds
  thumbnail: string | null; // data URL
}

export interface BoardState {
  /** All known boards in the boards directory. */
  boards: BoardEntry[];
  /** ID of the currently active board (matches a BoardEntry.id or null for unsaved). */
  activeBoardId: string | null;
  /** Whether the board panel is expanded. */
  panelOpen: boolean;
  /** Whether boards have been loaded from disk at least once. */
  initialized: boolean;

  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;

  /** Load board list from the filesystem. */
  refreshBoards: () => Promise<void>;
  /** Switch to a different board by id (auto-saves current first). */
  switchBoard: (id: string) => Promise<void>;
  /** Create a new board and switch to it. */
  createBoard: (name?: string) => Promise<void>;
  /** Delete a board file and remove from list. */
  deleteBoard: (id: string) => Promise<void>;
  /** Rename a board (updates metadata + re-saves). */
  renameBoard: (id: string, newName: string) => Promise<void>;
  /** Save the current board to its file in the boards directory. */
  saveCurrentBoard: () => Promise<void>;
  /** Update the thumbnail for a board. */
  setThumbnail: (id: string, dataUrl: string) => void;
  /** Create a new board pre-populated with provided elements. */
  createBoardFromElements: (name: string, elements: CanvasElement[]) => Promise<void>;
  /** Save the current board as a custom template (.inkboard in templates dir). */
  saveAsTemplate: (name: string) => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────

async function getBoardsDir(): Promise<string> {
  return invoke<string>("get_boards_directory");
}

async function writeBoardFile(path: string, board: Board): Promise<void> {
  const toSave: Board = {
    ...board,
    metadata: {
      ...board.metadata,
      formatVersion: FORMAT_VERSION,
      updatedAt: new Date().toISOString(),
    },
  };
  const json = JSON.stringify(toSave, null, 2);
  await invoke("write_file", { path, contents: json });
}

async function readBoardFile(path: string): Promise<Board> {
  const contents: string = await invoke("read_file_contents", { path });
  const board: Board = JSON.parse(contents);
  if (!board.metadata || !Array.isArray(board.elements)) {
    throw new Error("Invalid .inkboard file format");
  }
  return board;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "Untitled";
}

// ─── Store ──────────────────────────────────────────────────────

export const useBoardStore = create<BoardState>()((set, get) => ({
  boards: [],
  activeBoardId: null,
  panelOpen: false,
  initialized: false,

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setPanelOpen: (open) => set({ panelOpen: open }),

  refreshBoards: async () => {
    try {
      const files =
        await invoke<Array<{ path: string; name: string; last_modified: number }>>(
          "list_board_files",
        );

      const { boards: existing } = get();
      const thumbnailMap = new Map(existing.map((b) => [b.filePath, b.thumbnail]));

      const boards: BoardEntry[] = files.map((f) => ({
        id: f.path, // use file path as stable id
        name: f.name,
        filePath: f.path,
        lastModified: f.last_modified,
        thumbnail: thumbnailMap.get(f.path) ?? null,
      }));

      set({ boards, initialized: true });
      refreshTrayMenu();
    } catch (err) {
      console.error("Failed to refresh boards:", err);
      set({ initialized: true });
    }
  },

  switchBoard: async (id) => {
    const { activeBoardId, boards } = get();
    if (id === activeBoardId) return;

    // Auto-save current board first
    if (activeBoardId) {
      try {
        await get().saveCurrentBoard();
      } catch {
        // continue even if save fails
      }
    }

    const entry = boards.find((b) => b.id === id);
    if (!entry) return;

    try {
      const board = await readBoardFile(entry.filePath);
      useDocumentStore.getState().loadBoard(board);
      useHistoryStore.getState().clearHistory();
      useFileStore.setState({
        currentFilePath: entry.filePath,
        dirty: false,
      });
      set({ activeBoardId: id });
      document.title = `${entry.name} — DraftInk`;

      // Refresh board list to pick up any lastModified changes
      await get().refreshBoards();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to open board:\n${msg}`);
    }
  },

  createBoard: async (name = "Untitled") => {
    await get().createBoardFromElements(name, []);
  },

  createBoardFromElements: async (name: string, elements: CanvasElement[]) => {
    // Auto-save current board first
    const { activeBoardId } = get();
    if (activeBoardId) {
      try {
        await get().saveCurrentBoard();
      } catch {
        // continue
      }
    }

    try {
      const boardsDir = await getBoardsDir();
      const safeName = sanitizeFileName(name);
      const uniqueSuffix = generateId().slice(0, 6);
      const fileName = `${safeName}_${uniqueSuffix}.inkboard`;
      const filePath = boardsDir.replace(/[\\/]$/, "") + "\\" + fileName;

      const board = createEmptyBoard(safeName);
      board.elements = elements;
      await writeBoardFile(filePath, board);

      useDocumentStore.getState().loadBoard(board);
      useHistoryStore.getState().clearHistory();
      useFileStore.setState({ currentFilePath: filePath, dirty: false });

      // Center viewport on template content
      if (elements.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const el of elements) {
          const ex = el.position.x;
          const ey = el.position.y;
          minX = Math.min(minX, ex);
          minY = Math.min(minY, ey);
          const s = "size" in el ? (el as { size: { width: number; height: number } }).size : null;
          const ed = "endDelta" in el ? (el as { endDelta: { x: number; y: number } }).endDelta : null;
          maxX = Math.max(maxX, ex + (s ? s.width : ed ? Math.abs(ed.x) : 0));
          maxY = Math.max(maxY, ey + (s ? s.height : ed ? Math.abs(ed.y) : 0));
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        useViewportUIStore.getState().setPendingPanTo({ x: cx, y: cy });
      }

      set({ activeBoardId: filePath });
      document.title = `${safeName} — DraftInk`;

      await get().refreshBoards();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to create board:\n${msg}`);
    }
  },

  deleteBoard: async (id) => {
    const entry = get().boards.find((b) => b.id === id);
    if (!entry) return;

    const confirmed = window.confirm(`Delete "${entry.name}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await invoke("delete_board_file", { path: entry.filePath });

      // If we deleted the active board, create a new one
      if (get().activeBoardId === id) {
        set({ activeBoardId: null });
        useDocumentStore.getState().newBoard();
        useHistoryStore.getState().clearHistory();
        useFileStore.setState({ currentFilePath: null, dirty: false });
        document.title = "DraftInk — Untitled";
      }

      await get().refreshBoards();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to delete board:\n${msg}`);
    }
  },

  renameBoard: async (id, newName) => {
    const entry = get().boards.find((b) => b.id === id);
    if (!entry) return;

    const trimmed = newName.trim();
    if (!trimmed) return;

    // If it's the active board, update the document store metadata too
    if (get().activeBoardId === id) {
      useDocumentStore.getState().updateMetadata({ name: trimmed });
    }

    // Read, rename metadata, re-save
    try {
      const board = await readBoardFile(entry.filePath);
      board.metadata.name = trimmed;
      await writeBoardFile(entry.filePath, board);

      set((s) => ({
        boards: s.boards.map((b) => (b.id === id ? { ...b, name: trimmed } : b)),
      }));
      if (get().activeBoardId === id) {
        document.title = `${trimmed} — DraftInk`;
      }
    } catch (err) {
      console.error("Failed to rename board:", err);
    }
  },

  saveCurrentBoard: async () => {
    const { activeBoardId } = get();
    if (!activeBoardId) return;

    const entry = get().boards.find((b) => b.id === activeBoardId);
    if (!entry) return;

    const board = useDocumentStore.getState().board;
    await writeBoardFile(entry.filePath, board);
    useFileStore.setState({ dirty: false });

    // Update lastModified in local state
    set((s) => ({
      boards: s.boards.map((b) =>
        b.id === activeBoardId ? { ...b, lastModified: Math.floor(Date.now() / 1000) } : b,
      ),
    }));
  },

  setThumbnail: (id, dataUrl) =>
    set((s) => ({
      boards: s.boards.map((b) => (b.id === id ? { ...b, thumbnail: dataUrl } : b)),
    })),

  saveAsTemplate: async (name: string) => {
    try {
      const boardsDir = await getBoardsDir();
      // Templates go in a "templates" sub-directory alongside boards
      const templatesDir = boardsDir.replace(/[\\/]$/, "") + "\\templates";
      await invoke("ensure_directory", { path: templatesDir });

      const safeName = sanitizeFileName(name);
      const uniqueSuffix = generateId().slice(0, 6);
      const fileName = `${safeName}_${uniqueSuffix}.inkboard`;
      const filePath = templatesDir + "\\" + fileName;

      const board = useDocumentStore.getState().board;
      const templateBoard: Board = {
        metadata: {
          name: safeName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          formatVersion: FORMAT_VERSION,
        },
        elements: board.elements.map((el) => ({ ...el })),
      };
      await writeBoardFile(filePath, templateBoard);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to save template:\n${msg}`);
    }
  },
}));
