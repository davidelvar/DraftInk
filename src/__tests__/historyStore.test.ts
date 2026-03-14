import { describe, it, expect, beforeEach } from "vitest";
import { useHistoryStore } from "../store/historyStore";
import { useDocumentStore } from "../store/documentStore";
import { createEmptyBoard, DEFAULT_STROKE, DEFAULT_FILL } from "../types/document";
import type { RectangleElement } from "../types/document";

function makeRect(id: string): RectangleElement {
  return {
    id,
    type: "rectangle",
    position: { x: 0, y: 0 },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { ...DEFAULT_STROKE },
    size: { width: 50, height: 50 },
    fill: { ...DEFAULT_FILL },
    cornerRadius: 0,
  };
}

describe("historyStore", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      board: createEmptyBoard(),
      selectedIds: new Set(),
    });
    useHistoryStore.setState({
      undoStack: [],
      redoStack: [],
      toastMessage: null,
      toastTimeout: null,
    });
  });

  describe("pushSnapshot", () => {
    it("saves a snapshot of current elements to the undo stack", () => {
      useDocumentStore.getState().addElements([makeRect("r1")]);
      useHistoryStore.getState().pushSnapshot();

      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
      expect(useHistoryStore.getState().undoStack[0]).toHaveLength(1);
    });

    it("clears the redo stack on new snapshot", () => {
      // Push initial state, then do undo to populate redo
      useHistoryStore.getState().pushSnapshot();
      useDocumentStore.getState().addElements([makeRect("r1")]);
      useHistoryStore.getState().pushSnapshot();
      useHistoryStore.getState().undo();
      expect(useHistoryStore.getState().redoStack.length).toBeGreaterThan(0);

      // New snapshot clears redo
      useHistoryStore.getState().pushSnapshot();
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    });

    it("limits undo stack to MAX_HISTORY (100)", () => {
      for (let i = 0; i < 110; i++) {
        useHistoryStore.getState().pushSnapshot();
      }
      expect(useHistoryStore.getState().undoStack.length).toBeLessThanOrEqual(100);
    });
  });

  describe("undo", () => {
    it("restores the previous snapshot", () => {
      // Initial state: empty
      useHistoryStore.getState().pushSnapshot();

      // Add element
      useDocumentStore.getState().addElements([makeRect("r1")]);
      expect(useDocumentStore.getState().board.elements).toHaveLength(1);

      // Undo should restore to empty
      useHistoryStore.getState().undo();
      expect(useDocumentStore.getState().board.elements).toHaveLength(0);
    });

    it("moves current state to redo stack", () => {
      useHistoryStore.getState().pushSnapshot();
      useDocumentStore.getState().addElements([makeRect("r1")]);

      useHistoryStore.getState().undo();
      expect(useHistoryStore.getState().redoStack).toHaveLength(1);
      expect(useHistoryStore.getState().redoStack[0]).toHaveLength(1);
    });

    it("is a no-op when undo stack is empty", () => {
      useDocumentStore.getState().addElements([makeRect("r1")]);
      useHistoryStore.getState().undo();
      // Elements should remain unchanged
      expect(useDocumentStore.getState().board.elements).toHaveLength(1);
    });

    it("clears selection after undo", () => {
      useHistoryStore.getState().pushSnapshot();
      useDocumentStore.getState().addElements([makeRect("r1")]);
      useDocumentStore.getState().select(["r1"]);

      useHistoryStore.getState().undo();
      expect(useDocumentStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe("redo", () => {
    it("restores the next snapshot from redo stack", () => {
      useHistoryStore.getState().pushSnapshot();
      useDocumentStore.getState().addElements([makeRect("r1")]);

      useHistoryStore.getState().undo();
      expect(useDocumentStore.getState().board.elements).toHaveLength(0);

      useHistoryStore.getState().redo();
      expect(useDocumentStore.getState().board.elements).toHaveLength(1);
    });

    it("is a no-op when redo stack is empty", () => {
      useDocumentStore.getState().addElements([makeRect("r1")]);
      useHistoryStore.getState().redo();
      expect(useDocumentStore.getState().board.elements).toHaveLength(1);
    });

    it("redo stack is cleared when a new action is pushed after undo", () => {
      // Setup
      useHistoryStore.getState().pushSnapshot();
      useDocumentStore.getState().addElements([makeRect("r1")]);
      useHistoryStore.getState().pushSnapshot();
      useDocumentStore.getState().addElements([makeRect("r2")]);

      // Undo
      useHistoryStore.getState().undo();
      expect(useHistoryStore.getState().redoStack).toHaveLength(1);

      // New action should clear redo
      useHistoryStore.getState().pushSnapshot();
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    });
  });

  describe("canUndo / canRedo", () => {
    it("canUndo returns false on empty stack", () => {
      expect(useHistoryStore.getState().canUndo()).toBe(false);
    });

    it("canUndo returns true after pushSnapshot", () => {
      useHistoryStore.getState().pushSnapshot();
      expect(useHistoryStore.getState().canUndo()).toBe(true);
    });

    it("canRedo returns false on empty stack", () => {
      expect(useHistoryStore.getState().canRedo()).toBe(false);
    });

    it("canRedo returns true after undo", () => {
      useHistoryStore.getState().pushSnapshot();
      useHistoryStore.getState().undo();
      expect(useHistoryStore.getState().canRedo()).toBe(true);
    });
  });

  describe("clearHistory", () => {
    it("empties both stacks", () => {
      useHistoryStore.getState().pushSnapshot();
      useHistoryStore.getState().pushSnapshot();
      useHistoryStore.getState().undo();

      useHistoryStore.getState().clearHistory();
      expect(useHistoryStore.getState().undoStack).toHaveLength(0);
      expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    });
  });

  describe("multi-step undo/redo", () => {
    it("supports multiple undo/redo steps", () => {
      // State 0: empty
      useHistoryStore.getState().pushSnapshot();
      useDocumentStore.getState().addElements([makeRect("r1")]);

      // State 1: one element
      useHistoryStore.getState().pushSnapshot();
      useDocumentStore.getState().addElements([makeRect("r2")]);

      // State 2: two elements
      expect(useDocumentStore.getState().board.elements).toHaveLength(2);

      useHistoryStore.getState().undo(); // back to 1 element
      expect(useDocumentStore.getState().board.elements).toHaveLength(1);

      useHistoryStore.getState().undo(); // back to 0 elements
      expect(useDocumentStore.getState().board.elements).toHaveLength(0);

      useHistoryStore.getState().redo(); // forward to 1 element
      expect(useDocumentStore.getState().board.elements).toHaveLength(1);

      useHistoryStore.getState().redo(); // forward to 2 elements
      expect(useDocumentStore.getState().board.elements).toHaveLength(2);
    });
  });
});
