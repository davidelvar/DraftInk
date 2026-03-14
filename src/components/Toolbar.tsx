import { useState, useRef, useEffect, useCallback } from "react";
import { useToolStore, type ToolType } from "../store/toolStore";
import { useSettingsStore } from "../store/settingsStore";
import { useViewportUIStore } from "../store/viewportUIStore";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  insertImageElement,
  binaryToDataUrl,
  mimeTypeFromPath,
  IMAGE_EXTENSIONS,
} from "../utils/image";
import type { ConnectorPathStyle } from "../types/document";
import {
  MousePointer2,
  Hand,
  Pen,
  Eraser,
  Highlighter,
  Type,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  ChevronRight,
  ImagePlus,
  StickyNote,
  Cable,
  PenTool,
} from "lucide-react";

// ─── Preset colors ──────────────────────────────────────────────

const PRESET_COLORS = [
  "#1f2937", // gray-800  (dark)
  "#ffffff", // pure white
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#22c55e", // green-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
];

// ─── Shape sub-menu tools ───────────────────────────────────────

interface ShapeDef {
  tool: ToolType;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ size?: number }>;
}

const SHAPES: ShapeDef[] = [
  { tool: "rectangle", label: "Rectangle", shortcut: "R", icon: Square },
  { tool: "ellipse", label: "Ellipse", shortcut: "O", icon: Circle },
  { tool: "line", label: "Line", shortcut: "L", icon: Minus },
  { tool: "arrow", label: "Arrow", shortcut: "A", icon: ArrowUpRight },
];

const SHAPE_TOOLS = new Set<ToolType>(["rectangle", "ellipse", "line", "arrow"]);

const STICKY_COLORS = [
  { color: "#fef08a", label: "Yellow" },
  { color: "#fda4af", label: "Pink" },
  { color: "#86efac", label: "Green" },
  { color: "#93c5fd", label: "Blue" },
  { color: "#fdba74", label: "Orange" },
  { color: "#c4b5fd", label: "Purple" },
];

// ─── Tooltip ────────────────────────────────────────────────────

function Tooltip({
  text,
  shortcut,
  children,
  side = "right",
}: {
  text: string;
  shortcut?: string;
  children: React.ReactNode;
  side?: "right" | "left" | "bottom";
}) {
  const [show, setShow] = useState(false);

  const posClass =
    side === "right"
      ? "left-full ml-3 top-1/2 -translate-y-1/2"
      : side === "left"
        ? "right-full mr-3 top-1/2 -translate-y-1/2"
        : "top-full mt-2 left-1/2 -translate-x-1/2";

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className={`pointer-events-none absolute z-50 ${posClass} flex whitespace-nowrap rounded-lg text-[12px] font-medium items-center gap-2`}
          style={{
            backgroundColor: "#1e1e2e",
            color: "#f0f0f4",
            boxShadow: "0 4px 16px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.06)",
            padding: "8px 14px",
          }}
        >
          {text}
          {shortcut && (
            <kbd
              className="rounded text-[10px] font-mono"
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "#c0c0cc",
                padding: "3px 8px",
              }}
            >
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tool Button ────────────────────────────────────────────────

function ToolButton({
  active,
  onClick,
  children,
  label,
  shortcut,
  hasSubmenu,
  tooltipSide = "right",
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  shortcut?: string;
  hasSubmenu?: boolean;
  tooltipSide?: "right" | "left" | "bottom";
}) {
  return (
    <Tooltip text={label} shortcut={shortcut} side={tooltipSide}>
      <button
        onClick={onClick}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
        style={{
          backgroundColor: active ? "var(--accent)" : "transparent",
          color: active ? "#ffffff" : "var(--text-secondary)",
        }}
        onMouseEnter={(e) => {
          if (!active)
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--text-primary) 8%, transparent)";
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.backgroundColor = "transparent";
        }}
        aria-label={label}
      >
        {children}
        {hasSubmenu && (
          <span
            style={{
              position: "absolute",
              right: -1,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.6,
            }}
          >
            <ChevronRight size={8} strokeWidth={2.5} />
          </span>
        )}
      </button>
    </Tooltip>
  );
}

// ─── Separator ──────────────────────────────────────────────────

function Separator() {
  return <div className="mx-2 my-1 h-px" style={{ backgroundColor: "var(--border)" }} />;
}

// ─── Color Picker Popover ───────────────────────────────────────

function ColorPicker({
  color,
  onChange,
  onClose,
}: {
  color: string;
  onChange: (c: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const tbPos = useSettingsStore((s) => s.toolbarPosition);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [onClose]);

  // Close picker when native color input is dismissed (change event)
  useEffect(() => {
    const input = colorInputRef.current;
    if (!input) return;
    const handleChange = () => {
      onClose();
    };
    input.addEventListener("change", handleChange);
    return () => input.removeEventListener("change", handleChange);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute ${tbPos === "left" ? "left-full ml-4" : "right-full mr-4"} top-1/2 -translate-y-1/2 z-50`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        width: 240,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ padding: "16px 16px 12px 16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 12,
            placeItems: "center",
          }}
        >
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                onChange(c);
                onClose();
              }}
              className="transition-all hover:scale-110"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: c,
                outline: c === color ? "2.5px solid var(--accent)" : "none",
                outlineOffset: 3,
                border: "1.5px solid var(--border)",
                cursor: "pointer",
              }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>

      <div style={{ height: 1, margin: "0 16px", backgroundColor: "var(--border)" }} />

      <div style={{ padding: "12px 16px 16px 16px" }}>
        <label
          className="flex items-center transition-colors cursor-pointer"
          style={{ color: "var(--text-primary)", gap: 12, borderRadius: 8, padding: "8px 10px" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--text-primary) 6%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <input
            ref={colorInputRef}
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 28,
              height: 28,
              cursor: "pointer",
              borderRadius: 4,
              border: "none",
              backgroundColor: "transparent",
              padding: 0,
            }}
          />
          <span style={{ fontSize: 13 }}>Custom</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "monospace",
              fontSize: 11,
              letterSpacing: "0.05em",
              color: "var(--text-secondary)",
            }}
          >
            {color.toUpperCase()}
          </span>
        </label>
      </div>
    </div>
  );
}

// ─── Stroke Width Popover ───────────────────────────────────────

function StrokeWidthPopover({
  width,
  onChange,
  onClose,
}: {
  width: number;
  onChange: (w: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tbPos = useSettingsStore((s) => s.toolbarPosition);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [onClose]);

  const presets = [1, 2, 4, 8, 12];

  return (
    <div
      ref={ref}
      className={`absolute ${tbPos === "left" ? "left-full ml-4" : "right-full mr-4"} top-1/2 -translate-y-1/2 z-50 flex flex-col`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        width: 230,
        padding: 16,
        gap: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      {/* Visual preview */}
      <div
        className="flex items-center justify-center"
        style={{
          backgroundColor: "color-mix(in srgb, var(--text-primary) 5%, transparent)",
          borderRadius: 8,
          height: 48,
        }}
      >
        <svg
          width="170"
          height={Math.max(12, Math.min(width + 4, 28))}
          viewBox={`0 0 170 ${Math.max(12, Math.min(width + 4, 28))}`}
        >
          <line
            x1="14"
            y1={Math.max(6, Math.min(width + 2, 14))}
            x2="156"
            y2={Math.max(6, Math.min(width + 2, 14))}
            stroke="currentColor"
            strokeWidth={Math.max(1, Math.min(width, 12))}
            strokeLinecap="round"
            style={{ color: "var(--text-primary)" }}
          />
        </svg>
      </div>

      <input
        type="range"
        min={1}
        max={24}
        value={width}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-(--accent)"
        style={{ width: "100%" }}
      />

      <div className="flex" style={{ gap: 8 }}>
        {presets.map((w) => (
          <button
            key={w}
            onClick={() => {
              onChange(w);
              onClose();
            }}
            className="flex items-center justify-center transition-colors"
            style={{
              flex: 1,
              height: 36,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              backgroundColor: w === width ? "var(--accent)" : "transparent",
              color: w === width ? "#ffffff" : "var(--text-secondary)",
              border: `1.5px solid ${w === width ? "var(--accent)" : "var(--border)"}`,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              if (w !== width)
                e.currentTarget.style.backgroundColor =
                  "color-mix(in srgb, var(--text-primary) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              if (w !== width) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Shape Submenu ──────────────────────────────────────────────

function ShapeSubmenu({
  activeTool,
  onSelect,
  onClose,
}: {
  activeTool: ToolType;
  onSelect: (tool: ToolType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tbPos = useSettingsStore((s) => s.toolbarPosition);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute ${tbPos === "left" ? "left-full ml-4" : "right-full mr-4"} top-1/2 -translate-y-1/2 z-50 flex flex-col`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 8,
        gap: 4,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      {SHAPES.map(({ tool, label, shortcut, icon: Icon }) => (
        <button
          key={tool}
          onClick={() => {
            onSelect(tool);
            onClose();
          }}
          className="flex items-center transition-colors"
          style={{
            height: 36,
            gap: 10,
            borderRadius: 8,
            padding: "0 12px",
            paddingRight: 28,
            fontSize: 13,
            backgroundColor: activeTool === tool ? "var(--accent)" : "transparent",
            color: activeTool === tool ? "#ffffff" : "var(--text-primary)",
            cursor: "pointer",
            border: "none",
          }}
          onMouseEnter={(e) => {
            if (activeTool !== tool)
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            if (activeTool !== tool) e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Icon size={16} />
          {label}
          <kbd
            style={{
              marginLeft: "auto",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 10,
              fontFamily: "monospace",
              backgroundColor: "color-mix(in srgb, var(--text-primary) 8%, transparent)",
            }}
          >
            {shortcut}
          </kbd>
        </button>
      ))}
    </div>
  );
}

// ─── Sticky Color Picker ────────────────────────────────────────

function StickyColorPicker({
  color,
  onChange,
  onClose,
}: {
  color: string;
  onChange: (c: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tbPos = useSettingsStore((s) => s.toolbarPosition);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute ${tbPos === "left" ? "left-full ml-4" : "right-full mr-4"} top-1/2 -translate-y-1/2 z-50 flex`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 10,
        gap: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      {STICKY_COLORS.map(({ color: c, label }) => (
        <Tooltip key={c} text={label} side="bottom">
          <button
            onClick={() => {
              onChange(c);
              onClose();
            }}
            className="transition-all hover:scale-110"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: c,
              outline: c === color ? "2.5px solid var(--accent)" : "none",
              outlineOffset: 2,
              border: "1px solid rgba(0,0,0,0.1)",
              cursor: "pointer",
            }}
            aria-label={`Sticky ${label}`}
          />
        </Tooltip>
      ))}
    </div>
  );
}

// ─── Connector Style Picker ─────────────────────────────────────

const CONNECTOR_STYLES: Array<{ style: ConnectorPathStyle; label: string }> = [
  { style: "straight", label: "Straight" },
  { style: "elbow", label: "Elbow" },
  { style: "curved", label: "Curved" },
];

function ConnectorStylePicker({
  style,
  onChange,
  onClose,
}: {
  style: ConnectorPathStyle;
  onChange: (s: ConnectorPathStyle) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tbPos = useSettingsStore((s) => s.toolbarPosition);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute ${tbPos === "left" ? "left-full ml-4" : "right-full mr-4"} top-1/2 -translate-y-1/2 z-50 flex flex-col`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 8,
        gap: 4,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      {CONNECTOR_STYLES.map(({ style: s, label }) => (
        <button
          key={s}
          onClick={() => {
            onChange(s);
            onClose();
          }}
          className="flex items-center transition-colors"
          style={{
            height: 36,
            gap: 10,
            borderRadius: 8,
            padding: "0 12px",
            paddingRight: 28,
            fontSize: 13,
            backgroundColor: style === s ? "var(--accent)" : "transparent",
            color: style === s ? "#ffffff" : "var(--text-primary)",
            cursor: "pointer",
            border: "none",
          }}
          onMouseEnter={(e) => {
            if (style !== s)
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            if (style !== s) e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <ConnectorStyleIcon style={s} size={16} />
          {label}
        </button>
      ))}
    </div>
  );
}

function ConnectorStyleIcon({ style, size = 16 }: { style: ConnectorPathStyle; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {style === "straight" && <line x1="2" y1="14" x2="14" y2="2" />}
      {style === "elbow" && <polyline points="2,14 2,2 14,2" />}
      {style === "curved" && <path d="M2,14 C2,6 14,10 14,2" />}
    </svg>
  );
}

// ─── Main Toolbar ───────────────────────────────────────────────

export default function Toolbar() {
  const activeTool = useToolStore((s) => s.activeTool);
  const strokeColor = useToolStore((s) => s.strokeColor);
  const strokeWidth = useToolStore((s) => s.strokeWidth);
  const stickyColor = useToolStore((s) => s.stickyColor);
  const connectorStyle = useToolStore((s) => s.connectorStyle);
  const setTool = useToolStore((s) => s.setTool);
  const setStrokeColor = useToolStore((s) => s.setStrokeColor);
  const setStrokeWidth = useToolStore((s) => s.setStrokeWidth);
  const strokeOpacity = useToolStore((s) => s.strokeOpacity);
  const setStrokeOpacity = useToolStore((s) => s.setStrokeOpacity);
  const setStickyColor = useToolStore((s) => s.setStickyColor);
  const setConnectorStyle = useToolStore((s) => s.setConnectorStyle);

  const visibleTools = useSettingsStore((s) => s.visibleTools);
  const toolbarPosition = useSettingsStore((s) => s.toolbarPosition);
  const pressureSensitivity = useSettingsStore((s) => s.pressureSensitivity);
  const setPressureSensitivity = useSettingsStore((s) => s.setPressureSensitivity);

  const [showShapes, setShowShapes] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokeWidth, setShowStrokeWidth] = useState(false);
  const [showStickyColors, setShowStickyColors] = useState(false);
  const [showConnectorStyles, setShowConnectorStyles] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);

  // Track last-used shape tool for the shape button's icon
  const [lastShape, setLastShape] = useState<ToolType>("rectangle");

  const activeShapeIcon =
    SHAPES.find((s) => s.tool === activeTool) ??
    SHAPES.find((s) => s.tool === lastShape) ??
    SHAPES[0];

  const handleShapeSelect = useCallback(
    (tool: ToolType) => {
      setTool(tool);
      setLastShape(tool);
    },
    [setTool],
  );

  const handleInsertImage = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
      title: "Insert Image",
    });
    if (!selected) return;

    const filePath = selected as string;
    try {
      const data: number[] = await invoke("read_binary_file", { path: filePath });
      const mime = mimeTypeFromPath(filePath);
      const dataUrl = binaryToDataUrl(data, mime);
      const center = useViewportUIStore.getState().getViewportCenter();
      await insertImageElement(dataUrl, center);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to insert image:\n${msg}`);
    }
  }, []);

  // ── Keyboard shortcuts for tool switching + file ops ──
  // (Handled centrally by useKeyboardShortcuts in App.tsx)

  // Whether any shape tool is visible
  const anyShapeVisible = SHAPES.some((s) => visibleTools.has(s.tool));
  const tipSide = toolbarPosition === "left" ? "right" : ("left" as const);

  return (
    <>
      {/* Collapse/expand toggle — visible on narrow screens when toolbar is collapsed */}
      <button
        onClick={() => setToolbarCollapsed((v) => !v)}
        className={`absolute ${toolbarPosition === "left" ? "left-3" : "right-3"} top-1/2 z-40 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-xl shadow-lg transition-opacity md:hidden ${toolbarCollapsed ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
        aria-label={toolbarCollapsed ? "Show toolbar" : "Hide toolbar"}
      >
        <PenTool size={20} />
      </button>

      <div
        className={`absolute ${toolbarPosition === "left" ? "left-3" : "right-3"} top-1/2 z-40 flex -translate-y-1/2 flex-col items-center rounded-xl py-2.5 shadow-lg transition-all ${toolbarCollapsed ? "pointer-events-none scale-90 opacity-0 md:pointer-events-auto md:scale-100 md:opacity-100" : ""}`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Collapse button — visible on narrow screens when toolbar is open */}
        <button
          onClick={() => setToolbarCollapsed(true)}
          className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg transition-colors md:hidden"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Collapse toolbar"
        >
          <ChevronRight
            size={14}
            style={{ transform: toolbarPosition === "left" ? "rotate(180deg)" : "none" }}
          />
        </button>
        {/* === Drawing tools === */}
        <div className="flex flex-col items-center gap-1.5 px-2">
          {visibleTools.has("select") && (
            <ToolButton
              active={activeTool === "select"}
              onClick={() => setTool("select")}
              label="Select"
              shortcut="V"
              tooltipSide={tipSide}
            >
              <MousePointer2 size={20} />
            </ToolButton>
          )}

          {visibleTools.has("hand") && (
            <ToolButton
              active={activeTool === "hand"}
              onClick={() => setTool("hand")}
              label="Hand"
              tooltipSide={tipSide}
            >
              <Hand size={20} />
            </ToolButton>
          )}

          {visibleTools.has("pen") && (
            <ToolButton
              active={activeTool === "pen"}
              onClick={() => setTool("pen")}
              label="Pen"
              shortcut="P"
              tooltipSide={tipSide}
            >
              <Pen size={20} />
            </ToolButton>
          )}

          {visibleTools.has("eraser") && (
            <ToolButton
              active={activeTool === "eraser"}
              onClick={() => setTool("eraser")}
              label="Eraser"
              shortcut="E"
              tooltipSide={tipSide}
            >
              <Eraser size={20} />
            </ToolButton>
          )}

          {visibleTools.has("highlighter") && (
            <ToolButton
              active={activeTool === "highlighter"}
              onClick={() => setTool("highlighter")}
              label="Highlighter"
              shortcut="H"
              tooltipSide={tipSide}
            >
              <Highlighter size={20} />
            </ToolButton>
          )}

          {visibleTools.has("text") && (
            <ToolButton
              active={activeTool === "text"}
              onClick={() => setTool("text")}
              label="Text"
              shortcut="T"
              tooltipSide={tipSide}
            >
              <Type size={20} />
            </ToolButton>
          )}

          {/* Sticky Note tool */}
          {visibleTools.has("sticky") && (
            <div className="relative">
              <ToolButton
                active={activeTool === "sticky"}
                onClick={() => {
                  setTool("sticky");
                  setShowStickyColors((v) => !v);
                }}
                label="Sticky Note"
                shortcut="N"
                hasSubmenu
                tooltipSide={tipSide}
              >
                <StickyNote size={20} />
              </ToolButton>
              {showStickyColors && (
                <StickyColorPicker
                  color={stickyColor}
                  onChange={(c) => {
                    setStickyColor(c);
                    setTool("sticky");
                  }}
                  onClose={() => setShowStickyColors(false)}
                />
              )}
            </div>
          )}

          {/* Shape tool with submenu */}
          {anyShapeVisible && (
            <div className="relative">
              <ToolButton
                active={SHAPE_TOOLS.has(activeTool)}
                onClick={() => {
                  if (!SHAPE_TOOLS.has(activeTool)) {
                    handleShapeSelect(lastShape);
                  }
                  setShowShapes((v) => !v);
                }}
                label={activeShapeIcon.label}
                shortcut={activeShapeIcon.shortcut}
                hasSubmenu
                tooltipSide={tipSide}
              >
                <activeShapeIcon.icon size={20} />
              </ToolButton>
              {showShapes && (
                <ShapeSubmenu
                  activeTool={activeTool}
                  onSelect={handleShapeSelect}
                  onClose={() => setShowShapes(false)}
                />
              )}
            </div>
          )}

          {/* Connector tool */}
          {visibleTools.has("connector") && (
            <div className="relative">
              <ToolButton
                active={activeTool === "connector"}
                onClick={() => {
                  setTool("connector");
                  setShowConnectorStyles((v) => !v);
                }}
                label="Connector"
                shortcut="C"
                hasSubmenu
                tooltipSide={tipSide}
              >
                <Cable size={20} />
              </ToolButton>
              {showConnectorStyles && (
                <ConnectorStylePicker
                  style={connectorStyle}
                  onChange={(s) => {
                    setConnectorStyle(s);
                    setTool("connector");
                  }}
                  onClose={() => setShowConnectorStyles(false)}
                />
              )}
            </div>
          )}

          {/* Insert Image */}
          {visibleTools.has("image") && (
            <ToolButton
              onClick={handleInsertImage}
              label="Insert Image"
              shortcut="Ctrl+Shift+I"
              tooltipSide={tipSide}
            >
              <ImagePlus size={20} />
            </ToolButton>
          )}
        </div>

        <Separator />

        {/* === Color picker === */}
        <div className="flex flex-col items-center px-2">
          <div className="relative">
            <Tooltip text="Stroke Color" side={tipSide}>
              <button
                onClick={() => setShowColorPicker((v) => !v)}
                className="relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
                style={{
                  backgroundColor: showColorPicker
                    ? "color-mix(in srgb, var(--text-primary) 8%, transparent)"
                    : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!showColorPicker)
                    e.currentTarget.style.backgroundColor =
                      "color-mix(in srgb, var(--text-primary) 8%, transparent)";
                }}
                onMouseLeave={(e) => {
                  if (!showColorPicker) e.currentTarget.style.backgroundColor = "transparent";
                }}
                aria-label="Stroke Color"
              >
                <div
                  className="h-6 w-6 rounded-full"
                  style={{
                    backgroundColor: strokeColor,
                    border: "2px solid var(--border)",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: -1,
                    top: "50%",
                    transform: "translateY(-50%)",
                    opacity: 0.6,
                    color: "var(--text-secondary)",
                  }}
                >
                  <ChevronRight size={8} strokeWidth={2.5} />
                </span>
              </button>
            </Tooltip>
            {showColorPicker && (
              <ColorPicker
                color={strokeColor}
                onChange={(c) => setStrokeColor(c)}
                onClose={() => setShowColorPicker(false)}
              />
            )}
          </div>

          {/* === Stroke width === */}
          <div className="relative">
            <Tooltip text="Stroke Width" side={tipSide}>
              <button
                onClick={() => setShowStrokeWidth((v) => !v)}
                className="relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
                style={{
                  backgroundColor: showStrokeWidth
                    ? "color-mix(in srgb, var(--text-primary) 8%, transparent)"
                    : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!showStrokeWidth)
                    e.currentTarget.style.backgroundColor =
                      "color-mix(in srgb, var(--text-primary) 8%, transparent)";
                }}
                onMouseLeave={(e) => {
                  if (!showStrokeWidth) e.currentTarget.style.backgroundColor = "transparent";
                }}
                aria-label="Stroke Width"
              >
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line
                    x1="3"
                    y1="10"
                    x2="17"
                    y2="10"
                    stroke="currentColor"
                    strokeWidth={Math.max(1, Math.min(strokeWidth, 6))}
                    strokeLinecap="round"
                    style={{ color: "var(--text-secondary)" }}
                  />
                </svg>
                <span
                  style={{
                    position: "absolute",
                    right: -1,
                    top: "50%",
                    transform: "translateY(-50%)",
                    opacity: 0.6,
                    color: "var(--text-secondary)",
                  }}
                >
                  <ChevronRight size={8} strokeWidth={2.5} />
                </span>
              </button>
            </Tooltip>
            {showStrokeWidth && (
              <StrokeWidthPopover
                width={strokeWidth}
                onChange={(w) => setStrokeWidth(w)}
                onClose={() => setShowStrokeWidth(false)}
              />
            )}
          </div>

          {/* === Opacity slider (pen, highlighter, shapes) === */}
          {(activeTool === "pen" ||
            activeTool === "highlighter" ||
            SHAPE_TOOLS.has(activeTool)) && (
            <div className="flex flex-col items-center gap-1 py-1 px-2">
              <Tooltip text={`Opacity: ${Math.round(strokeOpacity * 100)}%`} side={tipSide}>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(strokeOpacity * 100)}
                  onChange={(e) => setStrokeOpacity(Number(e.target.value) / 100)}
                  className="h-20 cursor-pointer accent-blue-500"
                  style={{
                    writingMode: "vertical-lr",
                    direction: "rtl",
                    width: "20px",
                  }}
                  aria-label="Stroke Opacity"
                />
              </Tooltip>
              <span className="text-[10px] select-none" style={{ color: "var(--text-secondary)" }}>
                {Math.round(strokeOpacity * 100)}%
              </span>
            </div>
          )}

          {/* === Pressure sensitivity toggle (pen only) === */}
          {activeTool === "pen" && (
            <div className="flex flex-col items-center px-2 py-1">
              <Tooltip text={pressureSensitivity ? "Pressure: On" : "Pressure: Off"} side={tipSide}>
                <button
                  onClick={() => setPressureSensitivity(!pressureSensitivity)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
                  style={{
                    backgroundColor: pressureSensitivity ? "var(--accent)" : "transparent",
                    color: pressureSensitivity ? "#ffffff" : "var(--text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    if (!pressureSensitivity)
                      e.currentTarget.style.backgroundColor =
                        "color-mix(in srgb, var(--text-primary) 8%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    if (!pressureSensitivity) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  aria-label="Pressure Sensitivity"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 16 Q6 14 8 10 Q10 6 12 5 Q14 4 16 4" strokeWidth="1" />
                    <path
                      d="M4 16 Q6 14 8 10 Q10 6 12 5 Q14 4 16 4"
                      strokeWidth="3"
                      opacity="0.3"
                    />
                  </svg>
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
