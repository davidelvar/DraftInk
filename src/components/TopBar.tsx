import { useState, useRef, useEffect } from "react";
import { useHistoryStore } from "../store/historyStore";
import { useFileStore } from "../store/fileStore";
import { useBoardStore } from "../store/boardStore";
import { exportPNG, exportSVG, exportPDF } from "../utils/export";
import { useThemeStore, type ThemeMode } from "../store/themeStore";
import SettingsPanel from "./SettingsPanel";
import {
  FilePlus,
  FolderOpen,
  Save,
  Download,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  Monitor,
  Home,
  Settings,
  Presentation,
  BookTemplate,
  Search,
} from "lucide-react";
import { useViewportUIStore } from "../store/viewportUIStore";
import { useToolStore } from "../store/toolStore";
import { useSearchStore } from "../store/searchStore";

// â”€â”€â”€ Tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Tooltip({
  text,
  shortcut,
  children,
}: {
  text: string;
  shortcut?: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 flex whitespace-nowrap rounded-lg text-[12px] font-medium items-center gap-2"
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

// â”€â”€â”€ Separator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BarSeparator() {
  return (
    <div className="mx-1 w-px self-stretch my-1.5" style={{ backgroundColor: "var(--border)" }} />
  );
}

// â”€â”€â”€ Export Menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const [templateName, setTemplateName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) return;
    useBoardStore.getState().saveAsTemplate(templateName.trim());
    setTemplateName("");
    setShowNameInput(false);
    setOpen(false);
  };

  const items = [
    { label: "Export as PNG", action: exportPNG },
    { label: "Export as SVG", action: exportSVG },
    { label: "Export as PDF", action: exportPDF },
  ];

  return (
    <div ref={ref} className="relative">
      <Tooltip text="Export">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Export"
        >
          <Download size={18} />
        </button>
      </Tooltip>

      {open && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 flex flex-col rounded-xl py-1.5 shadow-lg"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            minWidth: 170,
          }}
        >
          {items.map(({ label, action }) => (
            <button
              key={label}
              onClick={() => {
                setOpen(false);
                action();
              }}
              className="mx-1.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors"
              style={{ color: "var(--text-primary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "color-mix(in srgb, var(--text-primary) 8%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {label}
            </button>
          ))}

          <div className="mx-3 my-1 h-px" style={{ backgroundColor: "var(--border)" }} />

          {showNameInput ? (
            <div className="mx-1.5 flex items-center gap-1 px-1 py-1">
              <input
                autoFocus
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveAsTemplate();
                  if (e.key === "Escape") {
                    setShowNameInput(false);
                    setTemplateName("");
                  }
                }}
                placeholder="Template name"
                className="flex-1 rounded-md px-2 py-1.5 text-[13px] outline-none"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  minWidth: 0,
                }}
              />
              <button
                onClick={handleSaveAsTemplate}
                className="rounded-md px-2 py-1.5 text-[12px] font-semibold"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "#fff",
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNameInput(true)}
              className="mx-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors"
              style={{ color: "var(--text-primary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "color-mix(in srgb, var(--text-primary) 8%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <BookTemplate size={14} />
              Save as Template
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Theme Toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const THEME_CYCLE: ThemeMode[] = ["light", "dark", "system"];

function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const next = () => {
    const idx = THEME_CYCLE.indexOf(mode);
    setMode(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const nextLabel = mode === "light" ? "Dark" : mode === "dark" ? "System" : "Light";

  return (
    <Tooltip text={`Switch to ${nextLabel}`}>
      <button
        onClick={next}
        className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
        style={{ color: "var(--text-secondary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor =
            "color-mix(in srgb, var(--text-primary) 8%, transparent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
        aria-label={`Switch to ${nextLabel}`}
      >
        {mode === "light" && <Moon size={18} />}
        {mode === "dark" && <Monitor size={18} />}
        {mode === "system" && <Sun size={18} />}
      </button>
    </Tooltip>
  );
}

function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Tooltip text="Settings">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
      </Tooltip>
      {open && <SettingsPanel onClose={() => setOpen(false)} />}
    </div>
  );
}

export interface TopBarProps {
  zoom: number;
  onZoom: (delta: number) => void;
  onResetZoom: () => void;
  onGoHome?: () => void;
}

export default function TopBar({ zoom, onZoom, onResetZoom, onGoHome }: TopBarProps) {
  const canUndo = useHistoryStore((s) => s.undoStack.length > 0);
  const canRedo = useHistoryStore((s) => s.redoStack.length > 0);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  const newFile = useFileStore((s) => s.newFile);
  const openFile = useFileStore((s) => s.openFile);
  const saveFile = useFileStore((s) => s.saveFile);
  const dirty = useFileStore((s) => s.dirty);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center rounded-xl px-2 py-1 shadow-lg gap-0.5"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Home button */}
      {onGoHome && (
        <Tooltip text="Home">
          <button
            onClick={onGoHome}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Home"
          >
            <Home size={20} />
          </button>
        </Tooltip>
      )}

      <BarSeparator />

      {/* File actions: New/Open hidden on narrow screens */}
      <div className="hidden sm:flex items-center gap-0.5">
        <Tooltip text="New Board" shortcut="Ctrl+N">
          <button
            onClick={() => newFile()}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="New Board"
          >
            <FilePlus size={18} />
          </button>
        </Tooltip>

        <Tooltip text="Open" shortcut="Ctrl+O">
          <button
            onClick={() => openFile()}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Open"
          >
            <FolderOpen size={18} />
          </button>
        </Tooltip>
      </div>

      <Tooltip text={dirty ? "Save (unsaved changes)" : "Save"} shortcut="Ctrl+S">
        <button
          onClick={() => saveFile()}
          className="relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Save"
        >
          <Save size={18} />
          {dirty && (
            <span
              className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--accent)" }}
            />
          )}
        </button>
      </Tooltip>

      <div className="hidden sm:block">
        <ExportMenu />
      </div>

      <BarSeparator />

      {/* Undo / Redo */}
      <Tooltip text="Undo" shortcut="Ctrl+Z">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors disabled:opacity-30"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled)
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Undo"
        >
          <Undo2 size={18} />
        </button>
      </Tooltip>

      <Tooltip text="Redo" shortcut="Ctrl+Y">
        <button
          onClick={redo}
          disabled={!canRedo}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors disabled:opacity-30"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled)
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Redo"
        >
          <Redo2 size={18} />
        </button>
      </Tooltip>

      {/* Search */}
      <Tooltip text="Search" shortcut="Ctrl+F">
        <button
          onClick={() => useSearchStore.getState().openSearch("board")}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Search"
        >
          <Search size={18} />
        </button>
      </Tooltip>

      {/* Zoom controls — hidden on narrow screens */}
      <div className="hidden md:flex items-center gap-0.5">
        <BarSeparator />

        <Tooltip text="Zoom Out" shortcut="Ctrl+-">
          <button
            onClick={() => onZoom(200)}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
        </Tooltip>

        <Tooltip text="Reset Zoom" shortcut="Ctrl+0">
          <button
            onClick={onResetZoom}
            className="flex h-11 w-auto min-w-[3rem] items-center justify-center rounded-lg px-1.5 text-xs font-medium transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Reset Zoom"
          >
            {zoomPercent}%
          </button>
        </Tooltip>

        <Tooltip text="Zoom In" shortcut="Ctrl++">
          <button
            onClick={() => onZoom(-200)}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
        </Tooltip>
      </div>

      <BarSeparator />

      {/* Presentation mode */}
      <Tooltip text="Present" shortcut="F5">
        <button
          onClick={() => {
            const currentTool = useToolStore.getState().activeTool;
            useViewportUIStore.setState({ prePresentationTool: currentTool });
            useViewportUIStore.getState().enterPresentationMode();
            useToolStore.getState().setTool("hand");
          }}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--text-primary) 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          aria-label="Presentation mode"
        >
          <Presentation size={18} />
        </button>
      </Tooltip>

      <BarSeparator />

      {/* Theme toggle */}
      <ThemeToggle />

      <div className="hidden sm:block">
        <BarSeparator />
      </div>

      {/* Settings */}
      <SettingsButton />
    </div>
  );
}
