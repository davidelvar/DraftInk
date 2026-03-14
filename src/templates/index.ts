import type { Board, CanvasElement } from "../types/document";
import { FORMAT_VERSION } from "../types/document";
import { generateId } from "../utils/id";
import { useThemeStore } from "../store/themeStore";

function isDark(): boolean {
  return useThemeStore.getState().resolved === "dark";
}

/** Theme-aware grays for template UI elements. */
function palette() {
  const dark = isDark();
  return {
    text: dark ? "#e5e7eb" : "#1f2937",
    textMuted: dark ? "#9ca3af" : "#6b7280",
    border: dark ? "#4b5563" : "#d1d5db",
    borderLight: dark ? "#374151" : "#e5e7eb",
    borderMedium: dark ? "#6b7280" : "#9ca3af",
    surfaceLight: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
    surfaceMuted: dark ? "#1f2937" : "#f3f4f6",
    surfaceSubtle: dark ? "#111827" : "#f9fafb",
  };
}

// ─── Template definition ────────────────────────────────────────

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  /** Returns elements with fresh IDs each time. */
  buildElements: () => CanvasElement[];
}

/** Create a board from a template. Generates fresh element IDs. */
export function boardFromTemplate(template: TemplateDefinition): Board {
  const now = new Date().toISOString();
  const elements = template.buildElements().map((el, i) => ({
    ...el,
    id: generateId(),
    zIndex: i,
  }));
  return {
    metadata: {
      name: template.name,
      createdAt: now,
      updatedAt: now,
      formatVersion: FORMAT_VERSION,
    },
    elements,
  };
}

// ─── Shared helpers ─────────────────────────────────────────────

const STICKY_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];

function sticky(
  x: number,
  y: number,
  text: string,
  bg: string,
  w = 200,
  h = 150,
): CanvasElement {
  return {
    id: "",
    type: "sticky",
    position: { x, y },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { color: "transparent", width: 0, opacity: 1 },
    size: { width: w, height: h },
    text,
    backgroundColor: bg,
    textColor: "#1e1b18",
    fontSize: 14,
    fontFamily: "Inter, system-ui, sans-serif",
  } as CanvasElement;
}

function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill = "transparent",
  strokeColor?: string,
  strokeWidth = 2,
  cornerRadius = 0,
): CanvasElement {
  if (strokeColor === undefined) strokeColor = isDark() ? "#9ca3af" : "#1f2937";
  return {
    id: "",
    type: "rectangle",
    position: { x, y },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { color: strokeColor, width: strokeWidth, opacity: 1 },
    size: { width: w, height: h },
    fill: { color: fill, opacity: 1 },
    cornerRadius,
  } as CanvasElement;
}

function text(
  x: number,
  y: number,
  content: string,
  fontSize = 16,
  bold = false,
  color?: string,
  align: "left" | "center" | "right" = "left",
): CanvasElement {
  if (color === undefined) color = isDark() ? "#e5e7eb" : "#1f2937";
  return {
    id: "",
    type: "text",
    position: { x, y },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { color, width: 0, opacity: 1 },
    text: content,
    fontSize,
    fontFamily: "Inter, system-ui, sans-serif",
    textAlign: align,
    bold,
    italic: false,
    fill: { color, opacity: 1 },
    size: { width: content.length * fontSize * 0.6, height: fontSize * 1.4 },
  } as CanvasElement;
}

function ellipse(
  x: number,
  y: number,
  w: number,
  h: number,
  fill = "transparent",
  strokeColor?: string,
): CanvasElement {
  if (strokeColor === undefined) strokeColor = isDark() ? "#9ca3af" : "#1f2937";
  return {
    id: "",
    type: "ellipse",
    position: { x, y },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { color: strokeColor, width: 2, opacity: 1 },
    size: { width: w, height: h },
    fill: { color: fill, opacity: 1 },
  } as CanvasElement;
}

function arrow(
  x: number,
  y: number,
  dx: number,
  dy: number,
  color?: string,
): CanvasElement {
  if (color === undefined) color = isDark() ? "#d1d5db" : "#1f2937";
  return {
    id: "",
    type: "arrow",
    position: { x, y },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { color, width: 2, opacity: 1 },
    endDelta: { x: dx, y: dy },
  } as CanvasElement;
}

function line(
  x: number,
  y: number,
  dx: number,
  dy: number,
  color?: string,
): CanvasElement {
  if (color === undefined) color = isDark() ? "#6b7280" : "#d1d5db";
  return {
    id: "",
    type: "line",
    position: { x, y },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { color, width: 2, opacity: 1 },
    endDelta: { x: dx, y: dy },
  } as CanvasElement;
}

// ─── Template definitions ───────────────────────────────────────

const blank: TemplateDefinition = {
  id: "blank",
  name: "Blank",
  description: "Start with an empty canvas",
  buildElements: () => [],
};

const brainstorm: TemplateDefinition = {
  id: "brainstorm",
  name: "Brainstorm",
  description: "Central topic with radiating ideas",
  buildElements: () => {
    const cx = 0, cy = 0;
    return [
      sticky(cx - 100, cy - 75, "Main Topic", "#fef08a", 200, 150),
      sticky(cx - 350, cy - 280, "Idea 1", STICKY_COLORS[1]),
      sticky(cx + 150, cy - 280, "Idea 2", STICKY_COLORS[2]),
      sticky(cx + 300, cy - 30, "Idea 3", STICKY_COLORS[3]),
      sticky(cx + 150, cy + 200, "Idea 4", STICKY_COLORS[4]),
      sticky(cx - 350, cy + 200, "Idea 5", STICKY_COLORS[5]),
      sticky(cx - 500, cy - 30, "Idea 6", STICKY_COLORS[1]),
      arrow(cx + 100, cy, 80, -200),
      arrow(cx + 100, cy, 160, 0),
      arrow(cx + 100, cy, 80, 200),
      arrow(cx - 100, cy, -80, -200),
      arrow(cx - 100, cy, -160, 0),
      arrow(cx - 100, cy, -80, 200),
    ];
  },
};

const kanban: TemplateDefinition = {
  id: "kanban",
  name: "Kanban Board",
  description: "Three columns: To Do, In Progress, Done",
  buildElements: () => {
    const colW = 280, colH = 600, gap = 40;
    const startX = -((colW * 3 + gap * 2) / 2);
    const startY = -300;
    const cols = ["To Do", "In Progress", "Done"];
    const colColors = ["#fecaca", "#fef08a", "#bbf7d0"];
    const elements: CanvasElement[] = [];

    cols.forEach((label, i) => {
      const x = startX + i * (colW + gap);
      const p = palette();
      elements.push(rect(x, startY, colW, colH, p.surfaceLight, p.border, 1, 8));
      elements.push(text(x + colW / 2 - label.length * 5, startY + 16, label, 18, true));
      // Sample cards
      elements.push(sticky(x + 20, startY + 60, `${label} task 1`, colColors[i], 240, 80));
      elements.push(sticky(x + 20, startY + 160, `${label} task 2`, colColors[i], 240, 80));
    });
    return elements;
  },
};

const flowchart: TemplateDefinition = {
  id: "flowchart",
  name: "Flowchart",
  description: "Start/end shapes with decision points",
  buildElements: () => {
    const cx = 0;
    return [
      // Start (ellipse)
      ellipse(cx - 60, -300, 120, 50, "#bbf7d0"),
      text(cx - 20, -285, "Start", 14, true),
      arrow(cx, -250, 0, 50),
      // Process 1
      rect(cx - 80, -200, 160, 60, "#bfdbfe", "#3b82f6", 2, 4),
      text(cx - 40, -180, "Process 1", 14, false),
      arrow(cx, -140, 0, 50),
      // Decision
      rect(cx - 70, -90, 140, 80, "#fef08a", "#eab308", 2, 0),
      text(cx - 38, -58, "Decision?", 14, true),
      arrow(cx, -10, 0, 50),
      arrow(cx + 70, -50, 120, 0),
      // Process 2
      rect(cx - 80, 40, 160, 60, "#bfdbfe", "#3b82f6", 2, 4),
      text(cx - 40, 60, "Process 2", 14, false),
      arrow(cx, 100, 0, 50),
      // Alt path
      rect(cx + 120, -80, 160, 60, "#e9d5ff", "#8b5cf6", 2, 4),
      text(cx + 145, -60, "Alt Process", 14, false),
      // End
      ellipse(cx - 60, 150, 120, 50, "#fecaca"),
      text(cx - 15, 165, "End", 14, true),
    ];
  },
};

const swotAnalysis: TemplateDefinition = {
  id: "swot",
  name: "SWOT Analysis",
  description: "2×2 grid: Strengths, Weaknesses, Opportunities, Threats",
  buildElements: () => {
    const cellW = 300, cellH = 250;
    const ox = -(cellW), oy = -(cellH);
    const labels = ["Strengths", "Weaknesses", "Opportunities", "Threats"];
    const colors = ["#bbf7d0", "#fecaca", "#bfdbfe", "#fef08a"];
    const elements: CanvasElement[] = [];

    // Title
    elements.push(text(ox + cellW - 80, oy - 50, "SWOT Analysis", 24, true));

    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const i = r * 2 + c;
        const x = ox + c * cellW;
        const y = oy + r * cellH;
        const p = palette();
        elements.push(rect(x, y, cellW, cellH, colors[i] + "33", p.borderMedium, 1, 0));
        elements.push(text(x + 12, y + 12, labels[i], 16, true));
        elements.push(text(x + 12, y + 42, "• Add items here", 13, false, p.textMuted));
      }
    }
    return elements;
  },
};

const weeklyPlanner: TemplateDefinition = {
  id: "weekly-planner",
  name: "Weekly Planner",
  description: "7-column grid for the week",
  buildElements: () => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const colW = 170, colH = 500;
    const totalW = colW * 7;
    const startX = -(totalW / 2);
    const startY = -250;
    const elements: CanvasElement[] = [];

    elements.push(text(startX, startY - 50, "Weekly Planner", 24, true));

    days.forEach((day, i) => {
      const x = startX + i * colW;
      const p = palette();
      elements.push(rect(x, startY, colW, colH, "transparent", p.border, 1, 0));
      elements.push(text(x + 12, startY + 10, day, 13, true));
      elements.push(line(x, startY + 36, colW, 0, p.borderLight));
    });
    return elements;
  },
};

const mindMap: TemplateDefinition = {
  id: "mind-map",
  name: "Mind Map",
  description: "Central node with branching topics",
  buildElements: () => {
    const cx = 0, cy = 0;
    const branches = [
      { label: "Branch A", x: -350, y: -200, color: "#bbf7d0" },
      { label: "Branch B", x: 200, y: -200, color: "#bfdbfe" },
      { label: "Branch C", x: 350, y: 50, color: "#fecaca" },
      { label: "Branch D", x: -400, y: 100, color: "#e9d5ff" },
      { label: "Branch E", x: -100, y: 250, color: "#fed7aa" },
      { label: "Branch F", x: 200, y: 250, color: "#fef08a" },
    ];
    const elements: CanvasElement[] = [];

    // Central node
    elements.push(ellipse(cx - 75, cy - 30, 150, 60, "#3b82f6"));
    elements.push(text(cx - 50, cy - 12, "Central Idea", 15, true, "#ffffff"));

    branches.forEach((b) => {
      elements.push(sticky(b.x, b.y, b.label, b.color, 150, 80));
      elements.push(arrow(
        cx + (b.x > cx ? 75 : -75),
        cy,
        b.x - cx + (b.x > cx ? -75 : 150) + (b.x > cx ? 0 : 75),
        b.y - cy + 40,
      ));
    });

    return elements;
  },
};

const wireframe: TemplateDefinition = {
  id: "wireframe",
  name: "Wireframe",
  description: "Desktop and mobile device frames",
  buildElements: () => {
    const elements: CanvasElement[] = [];
    const p = palette();

    // Desktop frame
    const dw = 600, dh = 400;
    const dx = -350, dy = -250;
    elements.push(rect(dx, dy, dw, dh, "transparent", p.borderMedium, 2, 8));
    // Title bar
    elements.push(rect(dx, dy, dw, 32, p.surfaceMuted, p.border, 1, 0));
    elements.push(text(dx + 12, dy + 8, "Desktop Layout", 12, true, p.textMuted));
    // Sidebar
    elements.push(rect(dx, dy + 32, 150, dh - 32, p.surfaceSubtle, p.borderLight, 1, 0));
    elements.push(text(dx + 16, dy + 48, "Navigation", 11, true, p.borderMedium));
    elements.push(text(dx + 16, dy + 72, "• Menu Item 1", 11, false, p.borderMedium));
    elements.push(text(dx + 16, dy + 92, "• Menu Item 2", 11, false, p.borderMedium));
    elements.push(text(dx + 16, dy + 112, "• Menu Item 3", 11, false, p.borderMedium));
    // Content area placeholder
    elements.push(rect(dx + 170, dy + 52, 400, 160, p.surfaceMuted, p.borderLight, 1, 4));
    elements.push(text(dx + 310, dy + 120, "Content Area", 14, false, p.borderMedium, "center"));
    // Button placeholder
    elements.push(rect(dx + 170, dy + 240, 120, 36, "#3b82f6", "#3b82f6", 0, 6));
    elements.push(text(dx + 195, dy + 250, "Button", 13, true, "#ffffff"));

    // Mobile frame
    const mw = 180, mh = 360;
    const mx = 320, my = -230;
    elements.push(rect(mx, my, mw, mh, "transparent", p.borderMedium, 2, 16));
    // Status bar
    elements.push(rect(mx, my, mw, 24, p.surfaceMuted, p.border, 1, 0));
    elements.push(text(mx + 60, my + 5, "9:41", 10, true, p.textMuted));
    // Header
    elements.push(rect(mx, my + 24, mw, 40, p.surfaceSubtle, p.borderLight, 1, 0));
    elements.push(text(mx + 48, my + 36, "Mobile App", 13, true, p.text));
    // Content
    elements.push(rect(mx + 12, my + 80, 156, 80, p.surfaceMuted, p.borderLight, 1, 4));
    elements.push(text(mx + 48, my + 112, "Card Content", 11, false, p.borderMedium));
    // Bottom nav
    elements.push(rect(mx, my + mh - 48, mw, 48, p.surfaceSubtle, p.borderLight, 1, 0));

    return elements;
  },
};

// ─── Exports ────────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: TemplateDefinition[] = [
  blank,
  brainstorm,
  kanban,
  flowchart,
  swotAnalysis,
  weeklyPlanner,
  mindMap,
  wireframe,
];
