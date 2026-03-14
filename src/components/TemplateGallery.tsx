import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Trash2, Download } from "lucide-react";
import { BUILT_IN_TEMPLATES, boardFromTemplate, type TemplateDefinition } from "../templates";
import { useBoardStore } from "../store/boardStore";
import type { Board } from "../types/document";

// ─── Types ──────────────────────────────────────────────────────

interface CustomTemplate {
  name: string;
  filePath: string;
  lastModified: number;
}

// ─── Mini canvas preview ────────────────────────────────────────

function TemplatePreview({ elements }: { elements: Board["elements"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    if (elements.length === 0) {
      ctx.fillStyle = "#d1d5db";
      ctx.font = "13px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Blank", w / 2, h / 2 + 4);
      return;
    }

    // Compute bounding box of all elements
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of elements) {
      const x = el.position.x;
      const y = el.position.y;
      let ex = x,
        ey = y;
      if ("size" in el && el.size) {
        ex = x + (el.size as { width: number }).width;
        ey = y + (el.size as { height: number }).height;
      } else if ("endDelta" in el && el.endDelta) {
        ex = x + (el.endDelta as { x: number }).x;
        ey = y + (el.endDelta as { y: number }).y;
      } else {
        ex = x + 40;
        ey = y + 40;
      }
      minX = Math.min(minX, x, ex);
      minY = Math.min(minY, y, ey);
      maxX = Math.max(maxX, x, ex);
      maxY = Math.max(maxY, y, ey);
    }

    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    const pad = 16;
    const scale = Math.min((w - pad * 2) / contentW, (h - pad * 2) / contentH, 1);
    const offsetX = (w - contentW * scale) / 2 - minX * scale;
    const offsetY = (h - contentH * scale) / 2 - minY * scale;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    for (const el of elements) {
      ctx.save();
      const { x, y } = el.position;

      if (el.type === "rectangle") {
        const { width: rw, height: rh } = el.size;
        if (el.fill.color !== "transparent") {
          ctx.fillStyle = el.fill.color;
          ctx.fillRect(x, y, rw, rh);
        }
        if (el.stroke.width > 0) {
          ctx.strokeStyle = el.stroke.color;
          ctx.lineWidth = Math.max(1, el.stroke.width);
          ctx.strokeRect(x, y, rw, rh);
        }
      } else if (el.type === "ellipse") {
        const { width: ew, height: eh } = el.size;
        ctx.beginPath();
        ctx.ellipse(x + ew / 2, y + eh / 2, ew / 2, eh / 2, 0, 0, Math.PI * 2);
        if (el.fill.color !== "transparent") {
          ctx.fillStyle = el.fill.color;
          ctx.fill();
        }
        ctx.strokeStyle = el.stroke.color;
        ctx.lineWidth = Math.max(1, el.stroke.width);
        ctx.stroke();
      } else if (el.type === "sticky") {
        const { width: sw, height: sh } = el.size;
        ctx.fillStyle = el.backgroundColor;
        ctx.fillRect(x, y, sw, sh);
        ctx.strokeStyle = "#00000015";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, sw, sh);
      } else if (el.type === "text") {
        ctx.fillStyle = el.fill.color;
        ctx.font = `${el.bold ? "bold " : ""}${Math.max(10, el.fontSize)}px sans-serif`;
        ctx.fillText(el.text, x, y + el.fontSize);
      } else if (el.type === "arrow" || el.type === "line") {
        ctx.strokeStyle = el.stroke.color;
        ctx.lineWidth = Math.max(1, el.stroke.width);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + el.endDelta.x, y + el.endDelta.y);
        ctx.stroke();
        if (el.type === "arrow") {
          const angle = Math.atan2(el.endDelta.y, el.endDelta.x);
          const headLen = 10;
          const tx = x + el.endDelta.x;
          const ty = y + el.endDelta.y;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - headLen * Math.cos(angle - 0.4), ty - headLen * Math.sin(angle - 0.4));
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - headLen * Math.cos(angle + 0.4), ty - headLen * Math.sin(angle + 0.4));
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }, [elements]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", borderRadius: 8 }}
    />
  );
}

// ─── Template Card ──────────────────────────────────────────────

function TemplateCard({
  name,
  description,
  elements,
  onSelect,
  onDelete,
}: {
  name: string;
  description?: string;
  elements: Board["elements"];
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="template-card"
      style={{
        width: 220,
        borderRadius: 12,
        border: "2px solid var(--border)",
        backgroundColor: "var(--bg-secondary)",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.12)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Preview */}
      <div style={{ width: "100%", height: 140, padding: 4, backgroundColor: "#f9fafb" }}>
        <TemplatePreview elements={elements} />
      </div>

      {/* Delete button for custom templates */}
      {onDelete && (
        <button
          className="template-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 26,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            border: "none",
            backgroundColor: "rgba(0,0,0,0.5)",
            color: "#fff",
            cursor: "pointer",
            opacity: 0,
            transition: "opacity 0.15s",
          }}
          aria-label="Delete template"
        >
          <Trash2 size={13} />
        </button>
      )}

      {/* Info */}
      <div style={{ padding: "10px 12px" }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        {description && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Template Gallery Modal ─────────────────────────────────────

export default function TemplateGallery({
  open,
  onClose,
  onCreateBoard,
}: {
  open: boolean;
  onClose: () => void;
  onCreateBoard: () => void;
}) {
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [customBoards, setCustomBoards] = useState<Map<string, Board>>(new Map());
  const [builtInBoards] = useState(
    () => new Map(BUILT_IN_TEMPLATES.map((t) => [t.id, boardFromTemplate(t)])),
  );
  const backdropRef = useRef<HTMLDivElement>(null);

  const createBoardFromElements = useBoardStore((s) => s.createBoardFromElements);

  // Load custom templates from disk
  const loadCustomTemplates = useCallback(async () => {
    try {
      const files =
        await invoke<Array<{ path: string; name: string; last_modified: number }>>(
          "list_template_files",
        );
      setCustomTemplates(
        files.map((f) => ({ name: f.name, filePath: f.path, lastModified: f.last_modified })),
      );

      // Load board data for previews
      const boards = new Map<string, Board>();
      for (const f of files) {
        try {
          const contents: string = await invoke("read_file_contents", { path: f.path });
          const board: Board = JSON.parse(contents);
          if (board.metadata && Array.isArray(board.elements)) {
            boards.set(f.path, board);
          }
        } catch {
          // skip broken templates
        }
      }
      setCustomBoards(boards);
    } catch {
      // templates dir may not exist yet
    }
  }, []);

  useEffect(() => {
    if (open) loadCustomTemplates();
  }, [open, loadCustomTemplates]);

  // Inject hover styles
  useEffect(() => {
    if (!open) return;
    const style = document.createElement("style");
    style.textContent = `
      .template-card:hover .template-delete-btn { opacity: 0.7 !important; }
      .template-card:hover .template-delete-btn:hover { opacity: 1 !important; background-color: rgba(220,38,38,0.8) !important; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [open]);

  const handleSelectBuiltIn = useCallback(
    async (template: TemplateDefinition) => {
      const board = boardFromTemplate(template);
      await createBoardFromElements(template.name, board.elements);
      onClose();
      onCreateBoard();
    },
    [createBoardFromElements, onClose, onCreateBoard],
  );

  const handleSelectCustom = useCallback(
    async (ct: CustomTemplate) => {
      const board = customBoards.get(ct.filePath);
      if (!board) return;
      await createBoardFromElements(board.metadata.name, board.elements);
      onClose();
      onCreateBoard();
    },
    [customBoards, createBoardFromElements, onClose, onCreateBoard],
  );

  const handleDeleteCustom = useCallback(
    async (ct: CustomTemplate) => {
      const confirmed = window.confirm(`Delete template "${ct.name}"?`);
      if (!confirmed) return;
      try {
        await invoke("delete_template_file", { path: ct.filePath });
        await loadCustomTemplates();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        window.alert(`Failed to delete template:\n${msg}`);
      }
    },
    [loadCustomTemplates],
  );

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "min(90vw, 860px)",
          maxHeight: "80vh",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              Template Gallery
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
              Choose a template to start with
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "none",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ overflowY: "auto", padding: "20px 24px 24px", flex: 1 }}>
          {/* Built-in templates */}
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 12,
            }}
          >
            Built-in Templates
          </h3>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              marginBottom: 24,
            }}
          >
            {BUILT_IN_TEMPLATES.map((t) => (
              <TemplateCard
                key={t.id}
                name={t.name}
                description={t.description}
                elements={builtInBoards.get(t.id)?.elements ?? []}
                onSelect={() => handleSelectBuiltIn(t)}
              />
            ))}
          </div>

          {/* Custom templates */}
          {customTemplates.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 12,
                }}
              >
                <Download
                  size={13}
                  style={{ display: "inline", marginRight: 6, verticalAlign: "-2px" }}
                />
                My Templates
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {customTemplates.map((ct) => (
                  <TemplateCard
                    key={ct.filePath}
                    name={ct.name}
                    elements={customBoards.get(ct.filePath)?.elements ?? []}
                    onSelect={() => handleSelectCustom(ct)}
                    onDelete={() => handleDeleteCustom(ct)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
