import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore, FONT_FAMILIES } from "../store/settingsStore";
import type { ToolbarItem } from "../store/settingsStore";
import { X } from "lucide-react";

// ─── Tool labels ────────────────────────────────────────────────

const TOOL_LABELS: Record<ToolbarItem, string> = {
  select: "Select",
  hand: "Hand",
  pen: "Pen",
  eraser: "Eraser",
  highlighter: "Highlighter",
  text: "Text",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  arrow: "Arrow",
  sticky: "Sticky Note",
  connector: "Connector",
  laser: "Laser Pointer",
  image: "Insert Image",
};

const FONT_LABELS: Record<string, string> = {
  "Inter, system-ui, sans-serif": "Sans-serif",
  "Georgia, serif": "Serif",
  "Menlo, monospace": "Monospace",
  "Comic Sans MS, cursive": "Handwritten",
};

// ─── Settings Panel ─────────────────────────────────────────────

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  const visibleTools = useSettingsStore((s) => s.visibleTools);
  const toggleToolVisibility = useSettingsStore((s) => s.toggleToolVisibility);
  const defaultFontFamily = useSettingsStore((s) => s.defaultFontFamily);
  const setDefaultFontFamily = useSettingsStore((s) => s.setDefaultFontFamily);
  const defaultFontSize = useSettingsStore((s) => s.defaultFontSize);
  const setDefaultFontSize = useSettingsStore((s) => s.setDefaultFontSize);
  const toolbarPosition = useSettingsStore((s) => s.toolbarPosition);
  const setToolbarPosition = useSettingsStore((s) => s.setToolbarPosition);

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  const sectionTitle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-secondary)",
    marginBottom: 8,
    marginTop: 4,
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: active
      ? "var(--accent)"
      : "color-mix(in srgb, var(--text-primary) 20%, transparent)",
    position: "relative",
    cursor: "pointer",
    transition: "background-color 0.15s",
    border: "none",
    flexShrink: 0,
  });

  const toggleKnob = (active: boolean): React.CSSProperties => ({
    position: "absolute",
    top: 2,
    left: active ? 18 : 2,
    width: 16,
    height: 16,
    borderRadius: "50%",
    backgroundColor: "#fff",
    transition: "left 0.15s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  });

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.4)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        style={{
          width: "100%",
          maxWidth: 680,
          maxHeight: "80vh",
          margin: "0 16px",
          overflowY: "auto",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
            Settings
          </div>
          <button
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 18,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Two-column layout ── */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {/* Left column: Toolbar Items */}
          <div style={{ flex: 1, minWidth: 260 }}>
            {/* ── Toolbar Visibility ── */}
            <div style={sectionTitle}>Toolbar Items</div>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}
            >
              {(["select", "hand", "pen", "eraser", "text", "sticky"] as ToolbarItem[]).map(
                (tool) => (
                  <div
                    key={tool}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                    onClick={() => toggleToolVisibility(tool)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "color-mix(in srgb, var(--text-primary) 6%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                      {TOOL_LABELS[tool]}
                    </span>
                    <button
                      style={toggleStyle(visibleTools.has(tool))}
                      aria-label={`Toggle ${TOOL_LABELS[tool]}`}
                    >
                      <div style={toggleKnob(visibleTools.has(tool))} />
                    </button>
                  </div>
                ),
              )}
            </div>

            {/* ── Shapes group ── */}
            <div style={{ ...sectionTitle, marginTop: 12 }}>Shapes</div>
            <div
              style={{
                borderRadius: 10,
                border: "1px solid var(--border)",
                padding: "6px 0",
                marginBottom: 10,
              }}
            >
              {(["rectangle", "ellipse", "line", "arrow"] as ToolbarItem[]).map((tool) => (
                <div
                  key={tool}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 14px",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleToolVisibility(tool)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "color-mix(in srgb, var(--text-primary) 6%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                    {TOOL_LABELS[tool]}
                  </span>
                  <button
                    style={toggleStyle(visibleTools.has(tool))}
                    aria-label={`Toggle ${TOOL_LABELS[tool]}`}
                  >
                    <div style={toggleKnob(visibleTools.has(tool))} />
                  </button>
                </div>
              ))}
            </div>

            {/* ── Actions ── */}
            <div style={{ ...sectionTitle, marginTop: 12 }}>Actions</div>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}
            >
              {(["image"] as ToolbarItem[]).map((tool) => (
                <div
                  key={tool}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                  onClick={() => toggleToolVisibility(tool)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "color-mix(in srgb, var(--text-primary) 6%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                    {TOOL_LABELS[tool]}
                  </span>
                  <button
                    style={toggleStyle(visibleTools.has(tool))}
                    aria-label={`Toggle ${TOOL_LABELS[tool]}`}
                  >
                    <div style={toggleKnob(visibleTools.has(tool))} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {/* Right column: Font & Toolbar Position */}
          <div style={{ flex: 1, minWidth: 260 }}>
            {/* ── Default Font ── */}
            <div style={sectionTitle}>Default Font</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {FONT_FAMILIES.map((fam) => (
                  <button
                    key={fam}
                    onClick={() => setDefaultFontFamily(fam)}
                    style={{
                      flex: "1 0 45%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontFamily: fam,
                      fontWeight: 500,
                      border:
                        fam === defaultFontFamily
                          ? "2px solid var(--accent)"
                          : "1.5px solid var(--border)",
                      backgroundColor:
                        fam === defaultFontFamily
                          ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                          : "transparent",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    {FONT_LABELS[fam] || fam}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
                  Size
                </span>
                <input
                  type="range"
                  min={8}
                  max={72}
                  value={defaultFontSize}
                  onChange={(e) => setDefaultFontSize(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    minWidth: 28,
                    textAlign: "right",
                  }}
                >
                  {defaultFontSize}
                </span>
              </div>

              {/* Font preview */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1.5px solid var(--border)",
                  backgroundColor: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
                  fontFamily: defaultFontFamily,
                  fontSize: Math.min(defaultFontSize, 36),
                  lineHeight: 1.4,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                The quick brown fox
              </div>
            </div>

            {/* ── Toolbar Position ── */}
            <div style={sectionTitle}>Toolbar Position</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["left", "right"] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setToolbarPosition(pos)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: "capitalize",
                    border:
                      pos === toolbarPosition
                        ? "2px solid var(--accent)"
                        : "1.5px solid var(--border)",
                    backgroundColor:
                      pos === toolbarPosition
                        ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                        : "transparent",
                    color: pos === toolbarPosition ? "var(--accent)" : "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
