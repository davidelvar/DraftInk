import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore } from "../store/documentStore";
import type { RectangleElement, FreehandElement, ConnectorElement, Board } from "../types/document";
import { createEmptyBoard, DEFAULT_STROKE, DEFAULT_FILL } from "../types/document";

function makeRect(overrides: Partial<RectangleElement> = {}): RectangleElement {
  return {
    id: overrides.id ?? "rect-1",
    type: "rectangle",
    position: { x: 10, y: 20 },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { ...DEFAULT_STROKE },
    size: { width: 100, height: 50 },
    fill: { ...DEFAULT_FILL },
    cornerRadius: 0,
    ...overrides,
  };
}

function makeFreehand(overrides: Partial<FreehandElement> = {}): FreehandElement {
  return {
    id: overrides.id ?? "fh-1",
    type: "freehand",
    position: { x: 0, y: 0 },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { ...DEFAULT_STROKE },
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 5 },
    ],
    isEraser: false,
    isHighlighter: false,
    ...overrides,
  };
}

describe("documentStore", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      board: createEmptyBoard(),
      selectedIds: new Set(),
    });
  });

  describe("addElements", () => {
    it("adds a single element to an empty board", () => {
      const rect = makeRect();
      useDocumentStore.getState().addElements([rect]);

      const elements = useDocumentStore.getState().board.elements;
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe("rectangle");
    });

    it("adds multiple elements and assigns ascending zIndex", () => {
      const a = makeRect({ id: "a" });
      const b = makeRect({ id: "b" });
      useDocumentStore.getState().addElements([a, b]);

      const elements = useDocumentStore.getState().board.elements;
      expect(elements).toHaveLength(2);
      expect(elements[1].zIndex).toBeGreaterThan(elements[0].zIndex);
    });

    it("updates the board updatedAt timestamp", () => {
      // Set a known past timestamp to avoid same-millisecond race
      useDocumentStore.getState().updateMetadata({ updatedAt: "2000-01-01T00:00:00.000Z" });
      useDocumentStore.getState().addElements([makeRect()]);
      const after = useDocumentStore.getState().board.metadata.updatedAt;
      expect(after).not.toBe("2000-01-01T00:00:00.000Z");
    });
  });

  describe("removeElements", () => {
    it("removes elements by ID", () => {
      useDocumentStore.getState().addElements([makeRect({ id: "r1" }), makeRect({ id: "r2" })]);
      useDocumentStore.getState().removeElements(["r1"]);

      const elements = useDocumentStore.getState().board.elements;
      expect(elements).toHaveLength(1);
      expect(elements[0].id).toBe("r2");
    });

    it("also removes deleted IDs from selection", () => {
      useDocumentStore.getState().addElements([makeRect({ id: "r1" })]);
      useDocumentStore.getState().select(["r1"]);
      expect(useDocumentStore.getState().selectedIds.has("r1")).toBe(true);

      useDocumentStore.getState().removeElements(["r1"]);
      expect(useDocumentStore.getState().selectedIds.has("r1")).toBe(false);
    });

    it("is a no-op for non-existent IDs", () => {
      useDocumentStore.getState().addElements([makeRect({ id: "r1" })]);
      useDocumentStore.getState().removeElements(["nonexistent"]);
      expect(useDocumentStore.getState().board.elements).toHaveLength(1);
    });

    it("cascade-deletes connectors when a connected element is removed", () => {
      const conn: ConnectorElement = {
        id: "conn-1",
        type: "connector",
        position: { x: 0, y: 0 },
        rotation: 0,
        zIndex: 2,
        locked: false,
        visible: true,
        stroke: { ...DEFAULT_STROKE },
        sourceId: "r1",
        targetId: "r2",
        sourceAnchor: "right",
        targetAnchor: "left",
        pathStyle: "straight",
      };
      useDocumentStore
        .getState()
        .addElements([makeRect({ id: "r1" }), makeRect({ id: "r2" }), conn]);
      expect(useDocumentStore.getState().board.elements).toHaveLength(3);

      useDocumentStore.getState().removeElements(["r1"]);
      const remaining = useDocumentStore.getState().board.elements;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("r2");
    });

    it("does not cascade-delete connectors unrelated to removed elements", () => {
      const conn: ConnectorElement = {
        id: "conn-1",
        type: "connector",
        position: { x: 0, y: 0 },
        rotation: 0,
        zIndex: 2,
        locked: false,
        visible: true,
        stroke: { ...DEFAULT_STROKE },
        sourceId: "r1",
        targetId: "r2",
        sourceAnchor: "right",
        targetAnchor: "left",
        pathStyle: "straight",
      };
      useDocumentStore
        .getState()
        .addElements([
          makeRect({ id: "r1" }),
          makeRect({ id: "r2" }),
          makeRect({ id: "r3" }),
          conn,
        ]);

      useDocumentStore.getState().removeElements(["r3"]);
      const remaining = useDocumentStore.getState().board.elements;
      expect(remaining).toHaveLength(3);
      expect(remaining.map((e) => e.id).sort()).toEqual(["conn-1", "r1", "r2"]);
    });
  });

  describe("updateElement", () => {
    it("updates fields on a matching element", () => {
      useDocumentStore.getState().addElements([makeRect({ id: "r1" })]);
      useDocumentStore.getState().updateElement("r1", {
        position: { x: 99, y: 99 },
      });

      const el = useDocumentStore.getState().getElementById("r1");
      expect(el?.position).toEqual({ x: 99, y: 99 });
    });

    it("does not affect other elements", () => {
      useDocumentStore
        .getState()
        .addElements([makeRect({ id: "r1" }), makeRect({ id: "r2", position: { x: 5, y: 5 } })]);
      useDocumentStore.getState().updateElement("r1", {
        position: { x: 99, y: 99 },
      });

      const r2 = useDocumentStore.getState().getElementById("r2");
      expect(r2?.position).toEqual({ x: 5, y: 5 });
    });
  });

  describe("getElementById", () => {
    it("returns the element if found", () => {
      useDocumentStore.getState().addElements([makeRect({ id: "r1" })]);
      const el = useDocumentStore.getState().getElementById("r1");
      expect(el).toBeDefined();
      expect(el?.id).toBe("r1");
    });

    it("returns undefined if not found", () => {
      const el = useDocumentStore.getState().getElementById("nonexistent");
      expect(el).toBeUndefined();
    });
  });

  describe("ordering", () => {
    it("bringToFront gives elements the highest zIndex", () => {
      useDocumentStore
        .getState()
        .addElements([makeRect({ id: "a" }), makeRect({ id: "b" }), makeRect({ id: "c" })]);
      useDocumentStore.getState().bringToFront(["a"]);

      const elements = useDocumentStore.getState().board.elements;
      const a = elements.find((e) => e.id === "a")!;
      const maxZ = Math.max(...elements.map((e) => e.zIndex));
      expect(a.zIndex).toBe(maxZ);
    });

    it("sendToBack gives elements the lowest zIndex", () => {
      useDocumentStore
        .getState()
        .addElements([makeRect({ id: "a" }), makeRect({ id: "b" }), makeRect({ id: "c" })]);
      useDocumentStore.getState().sendToBack(["c"]);

      const elements = useDocumentStore.getState().board.elements;
      const c = elements.find((e) => e.id === "c")!;
      const minZ = Math.min(...elements.map((e) => e.zIndex));
      expect(c.zIndex).toBe(minZ);
    });
  });

  describe("selection", () => {
    beforeEach(() => {
      useDocumentStore
        .getState()
        .addElements([makeRect({ id: "a" }), makeRect({ id: "b" }), makeRect({ id: "c" })]);
    });

    it("select adds IDs to selection", () => {
      useDocumentStore.getState().select(["a", "b"]);
      const sel = useDocumentStore.getState().selectedIds;
      expect(sel.has("a")).toBe(true);
      expect(sel.has("b")).toBe(true);
      expect(sel.has("c")).toBe(false);
    });

    it("deselect removes IDs from selection", () => {
      useDocumentStore.getState().select(["a", "b"]);
      useDocumentStore.getState().deselect(["a"]);
      const sel = useDocumentStore.getState().selectedIds;
      expect(sel.has("a")).toBe(false);
      expect(sel.has("b")).toBe(true);
    });

    it("clearSelection empties the set", () => {
      useDocumentStore.getState().select(["a", "b", "c"]);
      useDocumentStore.getState().clearSelection();
      expect(useDocumentStore.getState().selectedIds.size).toBe(0);
    });

    it("selectAll selects every element", () => {
      useDocumentStore.getState().selectAll();
      expect(useDocumentStore.getState().selectedIds.size).toBe(3);
    });
  });

  describe("loadBoard / newBoard", () => {
    it("loadBoard replaces the board and clears selection", () => {
      useDocumentStore.getState().addElements([makeRect({ id: "old" })]);
      useDocumentStore.getState().select(["old"]);

      const newBoard = createEmptyBoard("Loaded");
      newBoard.elements = [makeRect({ id: "new" })];
      useDocumentStore.getState().loadBoard(newBoard);

      expect(useDocumentStore.getState().board.metadata.name).toBe("Loaded");
      expect(useDocumentStore.getState().board.elements).toHaveLength(1);
      expect(useDocumentStore.getState().board.elements[0].id).toBe("new");
      expect(useDocumentStore.getState().selectedIds.size).toBe(0);
    });

    it("newBoard creates a fresh empty board", () => {
      useDocumentStore.getState().addElements([makeRect()]);
      useDocumentStore.getState().newBoard("Fresh");

      expect(useDocumentStore.getState().board.metadata.name).toBe("Fresh");
      expect(useDocumentStore.getState().board.elements).toHaveLength(0);
    });
  });

  describe("serialization round-trip", () => {
    it("board can be serialized to JSON and deserialized", () => {
      useDocumentStore
        .getState()
        .addElements([makeRect({ id: "r1" }), makeFreehand({ id: "fh1" })]);

      const board = useDocumentStore.getState().board;
      const json = JSON.stringify(board);
      const parsed: Board = JSON.parse(json);

      expect(parsed.metadata.name).toBe(board.metadata.name);
      expect(parsed.elements).toHaveLength(2);
      expect(parsed.elements[0].id).toBe("r1");
      expect(parsed.elements[1].id).toBe("fh1");
      expect(parsed.elements[0].type).toBe("rectangle");
      expect(parsed.elements[1].type).toBe("freehand");
    });

    it("preserves freehand points through serialization", () => {
      const points = [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 10, y: 10, pressure: 0.8 },
      ];
      useDocumentStore.getState().addElements([makeFreehand({ id: "fh1", points })]);

      const board = useDocumentStore.getState().board;
      const json = JSON.stringify(board);
      const parsed: Board = JSON.parse(json);
      const el = parsed.elements[0] as FreehandElement;

      expect(el.points).toEqual(points);
    });
  });

  describe("updateMetadata", () => {
    it("patches metadata fields", () => {
      useDocumentStore.getState().updateMetadata({ name: "Renamed" });
      expect(useDocumentStore.getState().board.metadata.name).toBe("Renamed");
    });
  });
});
