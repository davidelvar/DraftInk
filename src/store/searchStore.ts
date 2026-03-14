import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useDocumentStore } from "./documentStore";
import type { Board, CanvasElement } from "../types/document";

// ─── Types ──────────────────────────────────────────────────────

export interface SearchMatch {
  elementId: string;
  text: string;
  type: "text" | "sticky";
  /** Canvas-space center position for panning. */
  x: number;
  y: number;
}

export interface CrossBoardMatch {
  boardPath: string;
  boardName: string;
  elementId: string;
  text: string;
  type: "text" | "sticky";
  x: number;
  y: number;
}

export type SearchMode = "board" | "global";

interface SearchState {
  open: boolean;
  mode: SearchMode;
  query: string;

  /** Matches in the current board. */
  matches: SearchMatch[];
  /** Index of the currently focused in-board match (-1 = none). */
  activeMatchIndex: number;

  /** Cross-board results, grouped by board path. */
  crossBoardResults: CrossBoardMatch[];
  crossBoardLoading: boolean;

  /** Set of element IDs that match the current search (for highlight rendering). */
  highlightIds: Set<string>;
  /** The currently focused element ID (for stronger highlight). */
  activeHighlightId: string | null;

  openSearch: (mode: SearchMode) => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  setMode: (mode: SearchMode) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  goToMatch: (index: number) => void;
  searchCurrentBoard: () => void;
  searchAllBoards: () => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────

function extractTextMatches(elements: CanvasElement[], query: string): SearchMatch[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  const matches: SearchMatch[] = [];

  for (const el of elements) {
    if (el.type === "text" || el.type === "sticky") {
      const text = el.text;
      if (text.toLowerCase().includes(lower)) {
        const cx = el.position.x + ("size" in el ? el.size.width / 2 : 0);
        const cy = el.position.y + ("size" in el ? el.size.height / 2 : 0);
        matches.push({
          elementId: el.id,
          text,
          type: el.type,
          x: cx,
          y: cy,
        });
      }
    }
  }

  return matches;
}

// ─── Store ──────────────────────────────────────────────────────

export const useSearchStore = create<SearchState>()((set, get) => ({
  open: false,
  mode: "board",
  query: "",
  matches: [],
  activeMatchIndex: -1,
  crossBoardResults: [],
  crossBoardLoading: false,
  highlightIds: new Set<string>(),
  activeHighlightId: null,

  openSearch: (mode) => {
    set({ open: true, mode });
    // Re-run search with current query on open
    if (mode === "board") {
      get().searchCurrentBoard();
    }
  },

  closeSearch: () => {
    set({
      open: false,
      query: "",
      matches: [],
      activeMatchIndex: -1,
      crossBoardResults: [],
      crossBoardLoading: false,
      highlightIds: new Set(),
      activeHighlightId: null,
    });
  },

  setQuery: (query) => {
    set({ query });
    const { mode } = get();
    if (mode === "board") {
      get().searchCurrentBoard();
    }
  },

  setMode: (mode) => {
    set({ mode, matches: [], crossBoardResults: [], activeMatchIndex: -1 });
    if (mode === "board") {
      get().searchCurrentBoard();
    }
  },

  searchCurrentBoard: () => {
    const { query } = get();
    const elements = useDocumentStore.getState().board.elements;
    const matches = extractTextMatches(elements, query);
    const highlightIds = new Set(matches.map((m) => m.elementId));
    const activeMatchIndex = matches.length > 0 ? 0 : -1;
    const activeHighlightId = activeMatchIndex >= 0 ? matches[activeMatchIndex].elementId : null;
    set({ matches, highlightIds, activeMatchIndex, activeHighlightId });
  },

  nextMatch: () => {
    const { matches, activeMatchIndex } = get();
    if (matches.length === 0) return;
    const next = (activeMatchIndex + 1) % matches.length;
    set({
      activeMatchIndex: next,
      activeHighlightId: matches[next].elementId,
    });
  },

  prevMatch: () => {
    const { matches, activeMatchIndex } = get();
    if (matches.length === 0) return;
    const prev = (activeMatchIndex - 1 + matches.length) % matches.length;
    set({
      activeMatchIndex: prev,
      activeHighlightId: matches[prev].elementId,
    });
  },

  goToMatch: (index) => {
    const { matches } = get();
    if (index < 0 || index >= matches.length) return;
    set({
      activeMatchIndex: index,
      activeHighlightId: matches[index].elementId,
    });
  },

  searchAllBoards: async () => {
    const { query } = get();
    if (!query) {
      set({ crossBoardResults: [], crossBoardLoading: false });
      return;
    }

    set({ crossBoardLoading: true });

    try {
      const files =
        await invoke<Array<{ path: string; name: string; last_modified: number }>>(
          "list_board_files",
        );

      const results: CrossBoardMatch[] = [];

      for (const file of files) {
        try {
          const contents: string = await invoke("read_file_contents", {
            path: file.path,
          });
          const board: Board = JSON.parse(contents);
          if (!board.elements) continue;

          const matches = extractTextMatches(board.elements, query);
          for (const m of matches) {
            results.push({
              boardPath: file.path,
              boardName: board.metadata?.name ?? file.name,
              elementId: m.elementId,
              text: m.text,
              type: m.type,
              x: m.x,
              y: m.y,
            });
          }
        } catch {
          // Skip boards that can't be read/parsed
        }
      }

      set({ crossBoardResults: results, crossBoardLoading: false });
    } catch {
      set({ crossBoardResults: [], crossBoardLoading: false });
    }
  },
}));
