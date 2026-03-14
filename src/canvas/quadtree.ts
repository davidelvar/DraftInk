import type { Bounds } from "../types/document";

/** An entry stored in the quadtree: element ID + bounding box. */
export interface QuadEntry {
  id: string;
  bounds: Bounds;
}

const MAX_OBJECTS = 8;
const MAX_DEPTH = 8;

/**
 * Axis-aligned quadtree for fast spatial queries.
 * Supports insert, remove, query-by-region, and query-by-point.
 */
export class Quadtree {
  private entries: QuadEntry[] = [];
  private children: Quadtree[] | null = null;
  private bounds: Bounds;
  private depth: number;

  constructor(bounds: Bounds, depth = 0) {
    this.bounds = bounds;
    this.depth = depth;
  }

  /** Remove all entries and child nodes. */
  clear(): void {
    this.entries = [];
    this.children = null;
  }

  /** Insert an entry into the tree. */
  insert(entry: QuadEntry): void {
    // If we have children, try to fit into a child
    if (this.children) {
      const idx = this.getChildIndex(entry.bounds);
      if (idx !== -1) {
        this.children[idx].insert(entry);
        return;
      }
    }

    this.entries.push(entry);

    // Split if exceeding capacity
    if (this.entries.length > MAX_OBJECTS && this.depth < MAX_DEPTH && !this.children) {
      this.subdivide();
      // Re-distribute entries into children
      const remaining: QuadEntry[] = [];
      for (const e of this.entries) {
        const idx = this.getChildIndex(e.bounds);
        if (idx !== -1) {
          this.children![idx].insert(e);
        } else {
          remaining.push(e);
        }
      }
      this.entries = remaining;
    }
  }

  /** Remove an entry by ID. Returns true if found. */
  remove(id: string): boolean {
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].id === id) {
        this.entries.splice(i, 1);
        return true;
      }
    }
    if (this.children) {
      for (const child of this.children) {
        if (child.remove(id)) return true;
      }
    }
    return false;
  }

  /** Query all entries whose bounds overlap the given region. */
  queryRegion(region: Bounds, result: QuadEntry[] = []): QuadEntry[] {
    if (!boundsIntersect(this.bounds, region)) return result;

    for (const entry of this.entries) {
      if (boundsIntersect(entry.bounds, region)) {
        result.push(entry);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        child.queryRegion(region, result);
      }
    }

    return result;
  }

  /** Query all entries whose bounds contain the given point. */
  queryPoint(x: number, y: number, result: QuadEntry[] = []): QuadEntry[] {
    if (!pointInBounds(x, y, this.bounds)) return result;

    for (const entry of this.entries) {
      if (pointInBounds(x, y, entry.bounds)) {
        result.push(entry);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        child.queryPoint(x, y, result);
      }
    }

    return result;
  }

  private subdivide(): void {
    const { x, y, width, height } = this.bounds;
    const hw = width / 2;
    const hh = height / 2;
    const d = this.depth + 1;

    this.children = [
      new Quadtree({ x, y, width: hw, height: hh }, d), // NW
      new Quadtree({ x: x + hw, y, width: hw, height: hh }, d), // NE
      new Quadtree({ x, y: y + hh, width: hw, height: hh }, d), // SW
      new Quadtree({ x: x + hw, y: y + hh, width: hw, height: hh }, d), // SE
    ];
  }

  /** Determine which child quadrant fully contains the given bounds. Returns -1 if it straddles. */
  private getChildIndex(b: Bounds): number {
    const midX = this.bounds.x + this.bounds.width / 2;
    const midY = this.bounds.y + this.bounds.height / 2;

    const fitsTop = b.y >= this.bounds.y && b.y + b.height <= midY;
    const fitsBottom = b.y >= midY && b.y + b.height <= this.bounds.y + this.bounds.height;
    const fitsLeft = b.x >= this.bounds.x && b.x + b.width <= midX;
    const fitsRight = b.x >= midX && b.x + b.width <= this.bounds.x + this.bounds.width;

    if (fitsTop && fitsLeft) return 0; // NW
    if (fitsTop && fitsRight) return 1; // NE
    if (fitsBottom && fitsLeft) return 2; // SW
    if (fitsBottom && fitsRight) return 3; // SE
    return -1; // straddles
  }
}

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pointInBounds(x: number, y: number, b: Bounds): boolean {
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

// ─── Spatial Index Manager ──────────────────────────────────────

/**
 * High-level spatial index that wraps a quadtree.
 * Provides a simple API to rebuild, update, and query by viewport or point.
 */
export class SpatialIndex {
  private tree: Quadtree;
  private elementBounds: Map<string, Bounds> = new Map();

  constructor() {
    this.tree = new Quadtree({ x: -1e6, y: -1e6, width: 2e6, height: 2e6 });
  }

  /**
   * Rebuild the entire index from scratch.
   * Call when the element list changes significantly (load, undo, etc.)
   */
  rebuild(entries: QuadEntry[]): void {
    this.tree.clear();
    this.elementBounds.clear();
    for (const entry of entries) {
      this.tree.insert(entry);
      this.elementBounds.set(entry.id, entry.bounds);
    }
  }

  /** Update a single element's bounds (remove + re-insert). */
  update(entry: QuadEntry): void {
    this.tree.remove(entry.id);
    this.tree.insert(entry);
    this.elementBounds.set(entry.id, entry.bounds);
  }

  /** Remove an element from the index. */
  remove(id: string): void {
    this.tree.remove(id);
    this.elementBounds.delete(id);
  }

  /** Query elements whose bounds intersect the given viewport region. */
  queryRegion(region: Bounds): QuadEntry[] {
    return this.tree.queryRegion(region);
  }

  /** Query elements whose bounds contain the given point. */
  queryPoint(x: number, y: number): QuadEntry[] {
    return this.tree.queryPoint(x, y);
  }

  /** Get the cached bounds for an element. */
  getBounds(id: string): Bounds | undefined {
    return this.elementBounds.get(id);
  }
}
