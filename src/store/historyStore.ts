import { create } from "zustand";
import type { CanvasElement } from "../types/document";
import { useDocumentStore } from "./documentStore";

const MAX_HISTORY = 100;

export interface HistoryState {
  undoStack: CanvasElement[][];
  redoStack: CanvasElement[][];
  toastMessage: string | null;
  toastTimeout: ReturnType<typeof setTimeout> | null;

  /** Save current elements as a snapshot before a mutation. */
  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  undoStack: [],
  redoStack: [],
  toastMessage: null,
  toastTimeout: null,

  pushSnapshot: () => {
    const elements = useDocumentStore.getState().board.elements;
    const snapshot = elements.map((el) => structuredClone(el));
    set((s) => ({
      undoStack: [...s.undoStack.slice(-(MAX_HISTORY - 1)), snapshot],
      redoStack: [],
    }));
  },

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;

    const currentElements = useDocumentStore.getState().board.elements;
    const currentSnapshot = currentElements.map((el) => structuredClone(el));
    const previousSnapshot = undoStack[undoStack.length - 1];

    useDocumentStore.setState((s) => ({
      board: {
        ...s.board,
        elements: previousSnapshot,
        metadata: {
          ...s.board.metadata,
          updatedAt: new Date().toISOString(),
        },
      },
      selectedIds: new Set<string>(),
    }));

    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, currentSnapshot],
    }));

    showToast(set, get, "Undo");
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    const currentElements = useDocumentStore.getState().board.elements;
    const currentSnapshot = currentElements.map((el) => structuredClone(el));
    const nextSnapshot = redoStack[redoStack.length - 1];

    useDocumentStore.setState((s) => ({
      board: {
        ...s.board,
        elements: nextSnapshot,
        metadata: {
          ...s.board.metadata,
          updatedAt: new Date().toISOString(),
        },
      },
      selectedIds: new Set<string>(),
    }));

    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, currentSnapshot],
    }));

    showToast(set, get, "Redo");
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  clearHistory: () => set({ undoStack: [], redoStack: [] }),
}));

function showToast(
  set: (partial: Partial<HistoryState>) => void,
  get: () => HistoryState,
  message: string,
) {
  const prev = get().toastTimeout;
  if (prev) clearTimeout(prev);
  const timeout = setTimeout(() => {
    set({ toastMessage: null, toastTimeout: null });
  }, 1500);
  set({ toastMessage: message, toastTimeout: timeout });
}
