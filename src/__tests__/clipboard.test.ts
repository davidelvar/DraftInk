import { describe, it, expect, beforeEach } from "vitest";
import { getClipboard, setClipboard, incrementPasteCount } from "../hooks/useKeyboardShortcuts";
import type { RectangleElement } from "../types/document";

function makeRect(id: string, x = 0, y = 0): RectangleElement {
  return {
    id,
    type: "rectangle",
    position: { x, y },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { color: "#000", width: 2, opacity: 1 },
    size: { width: 100, height: 50 },
    fill: { color: "#fff", opacity: 1 },
    cornerRadius: 0,
  };
}

describe("clipboard helpers", () => {
  beforeEach(() => {
    setClipboard([]);
  });

  it("starts with an empty clipboard", () => {
    expect(getClipboard()).toEqual([]);
  });

  it("setClipboard stores elements and resets paste count", () => {
    const rect = makeRect("r1", 10, 20);
    setClipboard([rect]);
    expect(getClipboard()).toHaveLength(1);
    expect(getClipboard()[0].id).toBe("r1");
  });

  it("incrementPasteCount increments and returns the count", () => {
    setClipboard([makeRect("r1")]);
    expect(incrementPasteCount()).toBe(1);
    expect(incrementPasteCount()).toBe(2);
    expect(incrementPasteCount()).toBe(3);
  });

  it("setClipboard resets paste count", () => {
    setClipboard([makeRect("r1")]);
    incrementPasteCount();
    incrementPasteCount();
    setClipboard([makeRect("r2")]);
    expect(incrementPasteCount()).toBe(1);
  });

  it("setClipboard with empty array clears clipboard", () => {
    setClipboard([makeRect("r1")]);
    expect(getClipboard()).toHaveLength(1);
    setClipboard([]);
    expect(getClipboard()).toHaveLength(0);
  });

  it("stores multiple elements", () => {
    setClipboard([makeRect("r1", 0, 0), makeRect("r2", 50, 50)]);
    expect(getClipboard()).toHaveLength(2);
    expect(getClipboard().map((e) => e.id)).toEqual(["r1", "r2"]);
  });
});
