import { describe, it, expect, beforeEach } from "vitest";
import { Quadtree, SpatialIndex, type QuadEntry } from "../canvas/quadtree";
import type { Bounds } from "../types/document";

describe("Quadtree", () => {
  const worldBounds: Bounds = { x: 0, y: 0, width: 1000, height: 1000 };

  let tree: Quadtree;

  beforeEach(() => {
    tree = new Quadtree(worldBounds);
  });

  describe("insert and queryRegion", () => {
    it("inserts and retrieves a single entry", () => {
      const entry: QuadEntry = {
        id: "a",
        bounds: { x: 10, y: 10, width: 20, height: 20 },
      };
      tree.insert(entry);

      const results = tree.queryRegion({ x: 0, y: 0, width: 50, height: 50 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("a");
    });

    it("does not return entries outside the query region", () => {
      tree.insert({
        id: "a",
        bounds: { x: 800, y: 800, width: 20, height: 20 },
      });

      const results = tree.queryRegion({ x: 0, y: 0, width: 50, height: 50 });
      expect(results).toHaveLength(0);
    });

    it("returns overlapping entries from a region query", () => {
      tree.insert({ id: "a", bounds: { x: 10, y: 10, width: 30, height: 30 } });
      tree.insert({ id: "b", bounds: { x: 100, y: 100, width: 30, height: 30 } });
      tree.insert({ id: "c", bounds: { x: 500, y: 500, width: 30, height: 30 } });

      const results = tree.queryRegion({ x: 0, y: 0, width: 150, height: 150 });
      const ids = results.map((r) => r.id).sort();
      expect(ids).toEqual(["a", "b"]);
    });

    it("handles many entries causing subdivision", () => {
      for (let i = 0; i < 20; i++) {
        tree.insert({
          id: `item-${i}`,
          bounds: { x: i * 40, y: i * 40, width: 20, height: 20 },
        });
      }

      // Query the entire world — should return everything
      const allResults = tree.queryRegion(worldBounds);
      expect(allResults).toHaveLength(20);

      // Query a small region
      const smallResults = tree.queryRegion({ x: 0, y: 0, width: 50, height: 50 });
      expect(smallResults.length).toBeGreaterThanOrEqual(1);
      expect(smallResults.length).toBeLessThan(20);
    });
  });

  describe("queryPoint", () => {
    it("returns entries containing the point", () => {
      tree.insert({
        id: "a",
        bounds: { x: 10, y: 10, width: 50, height: 50 },
      });
      tree.insert({
        id: "b",
        bounds: { x: 100, y: 100, width: 50, height: 50 },
      });

      const results = tree.queryPoint(25, 25);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("a");
    });

    it("returns empty when no entries contain the point", () => {
      tree.insert({
        id: "a",
        bounds: { x: 10, y: 10, width: 50, height: 50 },
      });

      const results = tree.queryPoint(500, 500);
      expect(results).toHaveLength(0);
    });

    it("returns multiple overlapping entries at a point", () => {
      tree.insert({ id: "a", bounds: { x: 0, y: 0, width: 100, height: 100 } });
      tree.insert({ id: "b", bounds: { x: 20, y: 20, width: 100, height: 100 } });

      const results = tree.queryPoint(50, 50);
      expect(results).toHaveLength(2);
    });
  });

  describe("remove", () => {
    it("removes an entry by ID", () => {
      tree.insert({ id: "a", bounds: { x: 10, y: 10, width: 20, height: 20 } });
      tree.insert({ id: "b", bounds: { x: 50, y: 50, width: 20, height: 20 } });

      const removed = tree.remove("a");
      expect(removed).toBe(true);

      const results = tree.queryRegion(worldBounds);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("b");
    });

    it("returns false when removing non-existent ID", () => {
      const removed = tree.remove("nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      tree.insert({ id: "a", bounds: { x: 10, y: 10, width: 20, height: 20 } });
      tree.insert({ id: "b", bounds: { x: 50, y: 50, width: 20, height: 20 } });

      tree.clear();

      const results = tree.queryRegion(worldBounds);
      expect(results).toHaveLength(0);
    });
  });
});

describe("SpatialIndex", () => {
  let index: SpatialIndex;

  beforeEach(() => {
    index = new SpatialIndex();
  });

  it("rebuild populates the index and supports queries", () => {
    const entries: QuadEntry[] = [
      { id: "a", bounds: { x: 0, y: 0, width: 50, height: 50 } },
      { id: "b", bounds: { x: 200, y: 200, width: 50, height: 50 } },
    ];
    index.rebuild(entries);

    const region = index.queryRegion({ x: 0, y: 0, width: 100, height: 100 });
    expect(region).toHaveLength(1);
    expect(region[0].id).toBe("a");
  });

  it("update changes an element's position in the index", () => {
    index.rebuild([{ id: "a", bounds: { x: 0, y: 0, width: 50, height: 50 } }]);

    // Move element to a new location
    index.update({ id: "a", bounds: { x: 500, y: 500, width: 50, height: 50 } });

    // Old location should be empty
    const oldResults = index.queryRegion({ x: 0, y: 0, width: 100, height: 100 });
    expect(oldResults).toHaveLength(0);

    // New location should have the element
    const newResults = index.queryRegion({ x: 490, y: 490, width: 100, height: 100 });
    expect(newResults).toHaveLength(1);
    expect(newResults[0].id).toBe("a");
  });

  it("remove removes an element from the index", () => {
    index.rebuild([{ id: "a", bounds: { x: 0, y: 0, width: 50, height: 50 } }]);

    index.remove("a");

    const results = index.queryRegion({ x: 0, y: 0, width: 100, height: 100 });
    expect(results).toHaveLength(0);
  });

  it("getBounds returns cached bounds", () => {
    index.rebuild([{ id: "a", bounds: { x: 10, y: 20, width: 30, height: 40 } }]);

    expect(index.getBounds("a")).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(index.getBounds("nonexistent")).toBeUndefined();
  });

  it("queryPoint returns entries at a point", () => {
    index.rebuild([
      { id: "a", bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { id: "b", bounds: { x: 200, y: 200, width: 100, height: 100 } },
    ]);

    const results = index.queryPoint(50, 50);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("a");
  });
});
