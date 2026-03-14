import { describe, it, expect, beforeEach, vi } from "vitest";
import { useFileStore } from "../store/fileStore";
import { useDocumentStore } from "../store/documentStore";
import { useHistoryStore } from "../store/historyStore";
import { createEmptyBoard, DEFAULT_STROKE, DEFAULT_FILL } from "../types/document";
import type { RectangleElement } from "../types/document";

// Mock Tauri APIs
const mockInvoke = vi.fn();
const mockSave = vi.fn();
const mockOpen = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args: unknown[]) => mockSave(...args),
  open: (...args: unknown[]) => mockOpen(...args),
}));

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

describe("fileStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
    useFileStore.setState({
      currentFilePath: null,
      dirty: false,
    });

    // Suppress window.alert and window.confirm
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  describe("setDirty / setCurrentFilePath", () => {
    it("sets dirty state", () => {
      useFileStore.getState().setDirty(true);
      expect(useFileStore.getState().dirty).toBe(true);
    });

    it("sets current file path", () => {
      useFileStore.getState().setCurrentFilePath("/path/to/file.inkboard");
      expect(useFileStore.getState().currentFilePath).toBe("/path/to/file.inkboard");
    });
  });

  describe("newFile", () => {
    it("resets document, history, and file state", async () => {
      useDocumentStore.getState().addElements([makeRect("r1")]);
      useFileStore.setState({ currentFilePath: "/old.inkboard", dirty: true });

      await useFileStore.getState().newFile();

      expect(useDocumentStore.getState().board.elements).toHaveLength(0);
      expect(useFileStore.getState().currentFilePath).toBeNull();
      expect(useFileStore.getState().dirty).toBe(false);
    });

    it("prompts user if dirty and aborts if they decline", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      useFileStore.setState({ dirty: true, currentFilePath: "/old.inkboard" });

      await useFileStore.getState().newFile();

      // Should not have reset since user declined
      expect(useFileStore.getState().currentFilePath).toBe("/old.inkboard");
    });
  });

  describe("openFile", () => {
    it("opens a file via dialog and loads the board", async () => {
      const board = createEmptyBoard("Opened Board");
      board.elements = [makeRect("r1")];

      mockOpen.mockResolvedValue("/path/to/board.inkboard");
      mockInvoke.mockResolvedValue(JSON.stringify(board));

      await useFileStore.getState().openFile();

      expect(mockOpen).toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith("read_file_contents", {
        path: "/path/to/board.inkboard",
      });
      expect(useDocumentStore.getState().board.metadata.name).toBe("Opened Board");
      expect(useDocumentStore.getState().board.elements).toHaveLength(1);
      expect(useFileStore.getState().currentFilePath).toBe("/path/to/board.inkboard");
      expect(useFileStore.getState().dirty).toBe(false);
    });

    it("does nothing when user cancels the dialog", async () => {
      mockOpen.mockResolvedValue(null);

      await useFileStore.getState().openFile();

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("shows alert on invalid file format", async () => {
      mockOpen.mockResolvedValue("/bad.inkboard");
      mockInvoke.mockResolvedValue(JSON.stringify({ bad: "data" }));

      await useFileStore.getState().openFile();

      expect(window.alert).toHaveBeenCalled();
    });
  });

  describe("saveFile", () => {
    it("saves to current path when one exists", async () => {
      useFileStore.setState({ currentFilePath: "/existing.inkboard" });
      mockInvoke.mockResolvedValue(undefined);

      await useFileStore.getState().saveFile();

      expect(mockInvoke).toHaveBeenCalledWith(
        "write_file",
        expect.objectContaining({
          path: "/existing.inkboard",
        }),
      );
      expect(useFileStore.getState().dirty).toBe(false);
    });

    it("falls through to saveFileAs when no current path", async () => {
      mockSave.mockResolvedValue("/new/path.inkboard");
      mockInvoke.mockResolvedValue(undefined);

      await useFileStore.getState().saveFile();

      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe("saveFileAs", () => {
    it("prompts for path and saves with .inkboard extension", async () => {
      mockSave.mockResolvedValue("/chosen/path");
      mockInvoke.mockResolvedValue(undefined);

      await useFileStore.getState().saveFileAs();

      expect(mockInvoke).toHaveBeenCalledWith(
        "write_file",
        expect.objectContaining({
          path: "/chosen/path.inkboard",
        }),
      );
      expect(useFileStore.getState().currentFilePath).toBe("/chosen/path.inkboard");
    });

    it("does not duplicate .inkboard extension", async () => {
      mockSave.mockResolvedValue("/chosen/path.inkboard");
      mockInvoke.mockResolvedValue(undefined);

      await useFileStore.getState().saveFileAs();

      expect(mockInvoke).toHaveBeenCalledWith(
        "write_file",
        expect.objectContaining({
          path: "/chosen/path.inkboard",
        }),
      );
    });

    it("does nothing when user cancels save dialog", async () => {
      mockSave.mockResolvedValue(null);

      await useFileStore.getState().saveFileAs();

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(useFileStore.getState().currentFilePath).toBeNull();
    });
  });
});
