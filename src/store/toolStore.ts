import { create } from "zustand";
import type { ConnectorPathStyle } from "../types/document";

export type ToolType =
  | "pen"
  | "eraser"
  | "highlighter"
  | "select"
  | "hand"
  | "text"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "sticky"
  | "connector"
  | "laser";

export interface ToolState {
  activeTool: ToolType;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fillOpacity: number;
  eraserWidth: number;
  highlighterWidth: number;
  strokeOpacity: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  stickyColor: string;
  connectorStyle: ConnectorPathStyle;

  setTool: (tool: ToolType) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFillColor: (color: string) => void;
  setFillOpacity: (opacity: number) => void;
  setEraserWidth: (width: number) => void;
  setHighlighterWidth: (width: number) => void;
  setStrokeOpacity: (opacity: number) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setBold: (bold: boolean) => void;
  setItalic: (italic: boolean) => void;
  setStickyColor: (color: string) => void;
  setConnectorStyle: (style: ConnectorPathStyle) => void;
}

export const useToolStore = create<ToolState>()((set) => ({
  activeTool: "pen",
  strokeColor: "#1f2937",
  strokeWidth: 2,
  fillColor: "transparent",
  fillOpacity: 1,
  eraserWidth: 20,
  highlighterWidth: 20,
  strokeOpacity: 1,
  fontSize: 16,
  fontFamily: "Inter, system-ui, sans-serif",
  bold: false,
  italic: false,
  stickyColor: "#fef08a",
  connectorStyle: "straight" as ConnectorPathStyle,

  setTool: (tool) =>
    set((s) => ({
      activeTool: tool,
      // Auto-adjust opacity defaults when switching to/from highlighter
      strokeOpacity:
        tool === "highlighter" && s.activeTool !== "highlighter"
          ? 0.35
          : tool !== "highlighter" && s.activeTool === "highlighter"
            ? 1
            : s.strokeOpacity,
    })),
  setStrokeColor: (color) => set({ strokeColor: color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setFillColor: (color) => set({ fillColor: color }),
  setFillOpacity: (opacity) => set({ fillOpacity: opacity }),
  setEraserWidth: (width) => set({ eraserWidth: width }),
  setHighlighterWidth: (width) => set({ highlighterWidth: width }),
  setStrokeOpacity: (opacity) => set({ strokeOpacity: Math.max(0.1, Math.min(1, opacity)) }),
  setFontSize: (size) => set({ fontSize: size }),
  setFontFamily: (family) => set({ fontFamily: family }),
  setBold: (bold) => set({ bold }),
  setItalic: (italic) => set({ italic }),
  setStickyColor: (color) => set({ stickyColor: color }),
  setConnectorStyle: (style) => set({ connectorStyle: style }),
}));
