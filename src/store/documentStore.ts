import { create } from "zustand";
import { type Board, type CanvasElement, createEmptyBoard } from "../types/document";
import { generateId } from "../utils/id";

// ─── Store interface ────────────────────────────────────────────

export interface DocumentState {
  /** The currently active board. */
  board: Board;

  /** IDs of currently selected elements. */
  selectedIds: Set<string>;

  // ── Board-level actions ──
  /** Replace the entire board (e.g. after opening a file). */
  loadBoard: (board: Board) => void;
  /** Reset to a fresh empty board. */
  newBoard: (name?: string) => void;
  /** Update board metadata fields. */
  updateMetadata: (patch: Partial<Board["metadata"]>) => void;

  // ── Element CRUD ──
  /** Add one or more elements. */
  addElements: (elements: CanvasElement[]) => void;
  /** Update fields on an existing element by ID. */
  updateElement: <T extends CanvasElement>(id: string, patch: Partial<T>) => void;
  /** Remove elements by ID. */
  removeElements: (ids: string[]) => void;
  /** Get element by ID (returns undefined if not found). */
  getElementById: (id: string) => CanvasElement | undefined;

  // ── Ordering ──
  /** Move elements to the front (highest z-index). */
  bringToFront: (ids: string[]) => void;
  /** Move elements to the back (lowest z-index). */
  sendToBack: (ids: string[]) => void;
  /** Move elements one step forward in z-order. */
  bringForward: (ids: string[]) => void;
  /** Move elements one step backward in z-order. */
  sendBackward: (ids: string[]) => void;

  // ── Selection ──
  select: (ids: string[]) => void;
  deselect: (ids: string[]) => void;
  clearSelection: () => void;
  selectAll: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────

function touch(board: Board): Board {
  return {
    ...board,
    metadata: { ...board.metadata, updatedAt: new Date().toISOString() },
  };
}

function nextZIndex(elements: CanvasElement[]): number {
  if (elements.length === 0) return 0;
  return Math.max(...elements.map((e) => e.zIndex)) + 1;
}

function minZIndex(elements: CanvasElement[]): number {
  if (elements.length === 0) return 0;
  return Math.min(...elements.map((e) => e.zIndex)) - 1;
}

// ─── Store ──────────────────────────────────────────────────────

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  board: createEmptyBoard(),
  selectedIds: new Set<string>(),

  // ── Board ──

  loadBoard: (board) => set({ board, selectedIds: new Set() }),

  newBoard: (name) => set({ board: createEmptyBoard(name), selectedIds: new Set() }),

  updateMetadata: (patch) =>
    set((s) => ({
      board: {
        ...s.board,
        metadata: { ...s.board.metadata, ...patch },
      },
    })),

  // ── CRUD ──

  addElements: (elements) =>
    set((s) => {
      let z = nextZIndex(s.board.elements);
      const stamped = elements.map((el) => ({
        ...el,
        id: el.id || generateId(),
        zIndex: z++,
      }));
      return {
        board: touch({
          ...s.board,
          elements: [...s.board.elements, ...stamped],
        }),
      };
    }),

  updateElement: (id, patch) =>
    set((s) => ({
      board: touch({
        ...s.board,
        elements: s.board.elements.map((el) =>
          el.id === id ? ({ ...el, ...patch } as CanvasElement) : el,
        ),
      }),
    })),

  removeElements: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      // Also remove any connectors that reference deleted elements
      const connectorIds = s.board.elements
        .filter(
          (el) =>
            el.type === "connector" &&
            !idSet.has(el.id) &&
            (idSet.has(el.sourceId) || idSet.has(el.targetId)),
        )
        .map((el) => el.id);
      const allRemoved = new Set([...idSet, ...connectorIds]);
      return {
        board: touch({
          ...s.board,
          elements: s.board.elements.filter((el) => !allRemoved.has(el.id)),
        }),
        selectedIds: new Set([...s.selectedIds].filter((id) => !allRemoved.has(id))),
      };
    });
  },

  getElementById: (id) => get().board.elements.find((el) => el.id === id),

  // ── Ordering ──

  bringToFront: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      let z = nextZIndex(s.board.elements);
      return {
        board: touch({
          ...s.board,
          elements: s.board.elements.map((el) => (idSet.has(el.id) ? { ...el, zIndex: z++ } : el)),
        }),
      };
    });
  },

  sendToBack: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      let z = minZIndex(s.board.elements);
      return {
        board: touch({
          ...s.board,
          elements: s.board.elements.map((el) => (idSet.has(el.id) ? { ...el, zIndex: z-- } : el)),
        }),
      };
    });
  },

  bringForward: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const sorted = [...s.board.elements].sort((a, b) => a.zIndex - b.zIndex);
      const others = sorted.filter((el) => !idSet.has(el.id));
      const targets = sorted.filter((el) => idSet.has(el.id));
      if (targets.length === 0) return s;

      // Find the first non-selected element above the highest target
      const maxTargetZ = Math.max(...targets.map((el) => el.zIndex));
      const swapWith = others.find((el) => el.zIndex > maxTargetZ);
      if (!swapWith) return s; // already at front

      // Move all targets to just above that element
      let z = swapWith.zIndex + 1;
      return {
        board: touch({
          ...s.board,
          elements: s.board.elements.map((el) => (idSet.has(el.id) ? { ...el, zIndex: z++ } : el)),
        }),
      };
    });
  },

  sendBackward: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const sorted = [...s.board.elements].sort((a, b) => a.zIndex - b.zIndex);
      const others = sorted.filter((el) => !idSet.has(el.id));
      const targets = sorted.filter((el) => idSet.has(el.id));
      if (targets.length === 0) return s;

      // Find the first non-selected element below the lowest target
      const minTargetZ = Math.min(...targets.map((el) => el.zIndex));
      const swapWith = [...others].reverse().find((el) => el.zIndex < minTargetZ);
      if (!swapWith) return s; // already at back

      // Move all targets to just below that element
      let z = swapWith.zIndex - 1;
      return {
        board: touch({
          ...s.board,
          elements: s.board.elements.map((el) =>
            idSet.has(el.id) ? { ...el, zIndex: z-- } : el,
          ),
        }),
      };
    });
  },

  // ── Selection ──

  select: (ids) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      ids.forEach((id) => next.add(id));
      return { selectedIds: next };
    }),

  deselect: (ids) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      ids.forEach((id) => next.delete(id));
      return { selectedIds: next };
    }),

  clearSelection: () => set({ selectedIds: new Set() }),

  selectAll: () =>
    set((s) => ({
      selectedIds: new Set(s.board.elements.map((el) => el.id)),
    })),
}));
