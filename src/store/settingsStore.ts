import { create } from "zustand";
import type { ToolType } from "./toolStore";

export type ToolbarItem = ToolType | "image";

const ALL_TOOLS: ToolbarItem[] = [
  "select",
  "hand",
  "pen",
  "eraser",
  "highlighter",
  "text",
  "sticky",
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "connector",
  "image",
];

const FONT_FAMILIES = [
  "Inter, system-ui, sans-serif",
  "Georgia, serif",
  "Menlo, monospace",
  "Comic Sans MS, cursive",
];

export { ALL_TOOLS, FONT_FAMILIES };

export interface SettingsState {
  /** Which tools are visible in the toolbar. */
  visibleTools: Set<ToolbarItem>;
  /** Default font family for new text elements. */
  defaultFontFamily: string;
  /** Default font size for new text elements. */
  defaultFontSize: number;
  /** Toolbar position on screen. */
  toolbarPosition: "left" | "right";
  /** Whether pen pressure affects stroke width. */
  pressureSensitivity: boolean;
  /** Pressure response curve exponent (< 1 = softer, 1 = linear, > 1 = firmer). */
  pressureCurve: number;

  toggleToolVisibility: (tool: ToolbarItem) => void;
  setDefaultFontFamily: (family: string) => void;
  setDefaultFontSize: (size: number) => void;
  setToolbarPosition: (pos: "left" | "right") => void;
  setPressureSensitivity: (enabled: boolean) => void;
  setPressureCurve: (curve: number) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  visibleTools: new Set<ToolbarItem>(ALL_TOOLS),
  defaultFontFamily: "Inter, system-ui, sans-serif",
  defaultFontSize: 16,
  toolbarPosition: "left",
  pressureSensitivity: true,
  pressureCurve: 1,

  toggleToolVisibility: (tool) =>
    set((s) => {
      const next = new Set(s.visibleTools);
      if (next.has(tool)) {
        // Don't allow hiding all tools — keep at least one
        if (next.size > 1) next.delete(tool);
      } else {
        next.add(tool);
      }
      return { visibleTools: next };
    }),

  setDefaultFontFamily: (family) => set({ defaultFontFamily: family }),
  setDefaultFontSize: (size) => set({ defaultFontSize: Math.max(8, Math.min(size, 128)) }),
  setToolbarPosition: (pos) => set({ toolbarPosition: pos }),
  setPressureSensitivity: (enabled) => set({ pressureSensitivity: enabled }),
  setPressureCurve: (curve) => set({ pressureCurve: Math.max(0.2, Math.min(curve, 3)) }),
}));
