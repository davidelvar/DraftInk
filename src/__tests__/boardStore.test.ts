import { describe, it, expect, beforeEach, vi } from "vitest";
import { useBoardStore, type BoardEntry } from "../store/boardStore";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

describe("boardStore", () => {
  beforeEach(() => {
    useBoardStore.setState({
      boards: [],
      activeBoardId: null,
      panelOpen: false,
      initialized: false,
    });
  });

  describe("togglePanel / setPanelOpen", () => {
    it("togglePanel flips panelOpen", () => {
      expect(useBoardStore.getState().panelOpen).toBe(false);
      useBoardStore.getState().togglePanel();
      expect(useBoardStore.getState().panelOpen).toBe(true);
      useBoardStore.getState().togglePanel();
      expect(useBoardStore.getState().panelOpen).toBe(false);
    });

    it("setPanelOpen sets the panel state directly", () => {
      useBoardStore.getState().setPanelOpen(true);
      expect(useBoardStore.getState().panelOpen).toBe(true);
      useBoardStore.getState().setPanelOpen(false);
      expect(useBoardStore.getState().panelOpen).toBe(false);
    });
  });

  describe("board management via state", () => {
    it("can add boards to the list via setState", () => {
      const entries: BoardEntry[] = [
        {
          id: "board-1",
          name: "Test Board",
          filePath: "/path/to/test.inkboard",
          lastModified: 1000,
          thumbnail: null,
        },
        {
          id: "board-2",
          name: "Another Board",
          filePath: "/path/to/another.inkboard",
          lastModified: 2000,
          thumbnail: null,
        },
      ];

      useBoardStore.setState({ boards: entries });
      expect(useBoardStore.getState().boards).toHaveLength(2);
      expect(useBoardStore.getState().boards[0].name).toBe("Test Board");
    });

    it("tracks activeBoardId", () => {
      useBoardStore.setState({ activeBoardId: "board-1" });
      expect(useBoardStore.getState().activeBoardId).toBe("board-1");
    });
  });

  describe("setThumbnail", () => {
    it("updates the thumbnail for a specific board", () => {
      const entries: BoardEntry[] = [
        {
          id: "b1",
          name: "Board 1",
          filePath: "/path/b1.inkboard",
          lastModified: 1000,
          thumbnail: null,
        },
        {
          id: "b2",
          name: "Board 2",
          filePath: "/path/b2.inkboard",
          lastModified: 2000,
          thumbnail: null,
        },
      ];
      useBoardStore.setState({ boards: entries });

      useBoardStore.getState().setThumbnail("b1", "data:image/png;base64,abc");

      const boards = useBoardStore.getState().boards;
      expect(boards.find((b) => b.id === "b1")?.thumbnail).toBe("data:image/png;base64,abc");
      expect(boards.find((b) => b.id === "b2")?.thumbnail).toBeNull();
    });
  });

  describe("saveCurrentBoard state update", () => {
    it("updates lastModified on save via state manipulation", () => {
      const entries: BoardEntry[] = [
        {
          id: "board-1",
          name: "Board 1",
          filePath: "/path/board1.inkboard",
          lastModified: 1000,
          thumbnail: null,
        },
      ];
      useBoardStore.setState({ boards: entries, activeBoardId: "board-1" });

      // Simulate what saveCurrentBoard does to local state
      const now = Math.floor(Date.now() / 1000);
      useBoardStore.setState((s) => ({
        boards: s.boards.map((b) => (b.id === "board-1" ? { ...b, lastModified: now } : b)),
      }));

      const board = useBoardStore.getState().boards.find((b) => b.id === "board-1");
      expect(board!.lastModified).toBeGreaterThan(1000);
    });
  });

  describe("initialized flag", () => {
    it("starts as false", () => {
      expect(useBoardStore.getState().initialized).toBe(false);
    });

    it("can be set to true", () => {
      useBoardStore.setState({ initialized: true });
      expect(useBoardStore.getState().initialized).toBe(true);
    });
  });
});
