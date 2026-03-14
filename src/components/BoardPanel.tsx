import { useState, useRef, useEffect, useCallback } from "react";
import { useBoardStore, type BoardEntry } from "../store/boardStore";
import { useDocumentStore } from "../store/documentStore";
import { renderElements } from "../canvas/renderElements";
import type { CanvasElement } from "../types/document";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

// ─── Thumbnail generation ───────────────────────────────────────

const CARD_W = 140;
const CARD_H = 80;

function generateThumbnail(elements: CanvasElement[]): string | null {
  if (elements.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * 2;
  canvas.height = CARD_H * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    const pos = el.position;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    if ("size" in el && el.size) {
      maxX = Math.max(maxX, pos.x + el.size.width);
      maxY = Math.max(maxY, pos.y + el.size.height);
    } else if ("endDelta" in el && el.endDelta) {
      maxX = Math.max(maxX, pos.x + el.endDelta.x);
      maxY = Math.max(maxY, pos.y + el.endDelta.y);
    } else if ("points" in el && el.points) {
      for (const p of el.points) {
        maxX = Math.max(maxX, pos.x + p.x);
        maxY = Math.max(maxY, pos.y + p.y);
      }
    } else {
      maxX = Math.max(maxX, pos.x + 50);
      maxY = Math.max(maxY, pos.y + 50);
    }
  }

  if (!isFinite(minX)) return null;

  const contentW = maxX - minX || 1;
  const contentH = maxY - minY || 1;
  const padding = 16;
  const scaleX = (canvas.width - padding * 2) / contentW;
  const scaleY = (canvas.height - padding * 2) / contentH;
  const scale = Math.min(scaleX, scaleY, 4);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderedW = contentW * scale;
  const renderedH = contentH * scale;
  const offsetX = (canvas.width - renderedW) / 2 - minX * scale;
  const offsetY = (canvas.height - renderedH) / 2 - minY * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  renderElements(ctx, elements, undefined, scale);
  ctx.restore();

  return canvas.toDataURL("image/png", 0.7);
}

// ─── New Board Card (+ button) ──────────────────────────────────

function NewBoardCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      onClick={onCreate}
      style={{
        width: CARD_W,
        height: CARD_H + 30,
        flexShrink: 0,
        borderRadius: 8,
        border: "2px dashed var(--border)",
        backgroundColor: "transparent",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        transition: "border-color 0.15s, background-color 0.15s",
        color: "var(--text-secondary)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--accent) 6%, transparent)";
        e.currentTarget.style.color = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
      aria-label="New board"
    >
      <Plus size={22} />
      <span style={{ fontSize: 11, fontWeight: 600 }}>New Board</span>
    </div>
  );
}

// ─── Board Card ─────────────────────────────────────────────────

function BoardCard({
  entry,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  entry: BoardEntry;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== entry.name) {
      onRename(trimmed);
    } else {
      setEditName(entry.name);
    }
    setEditing(false);
  };

  return (
    <div
      onClick={onSelect}
      className="board-card"
      style={{
        width: CARD_W,
        flexShrink: 0,
        borderRadius: 8,
        border: isActive ? "2px solid var(--accent)" : "2px solid var(--border)",
        backgroundColor: isActive
          ? "color-mix(in srgb, var(--accent) 6%, var(--bg-primary))"
          : "var(--bg-primary)",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: isActive
          ? "0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent)"
          : "none",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = "var(--text-secondary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = "var(--border)";
        }
      }}
    >
      {/* Thumbnail area */}
      <div
        style={{
          width: "100%",
          height: CARD_H,
          backgroundColor: "color-mix(in srgb, var(--bg-primary) 80%, var(--bg-secondary))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "1px solid var(--border)",
          position: "relative",
        }}
      >
        {entry.thumbnail ? (
          <img
            src={entry.thumbnail}
            alt={entry.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            draggable={false}
          />
        ) : (
          <span style={{ fontSize: 10, color: "var(--text-secondary)", opacity: 0.4 }}>Empty</span>
        )}

        {/* Delete button — visible on card hover via CSS */}
        <button
          className="board-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: "absolute",
            top: 3,
            right: 3,
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 5,
            border: "none",
            backgroundColor: "rgba(0,0,0,0.5)",
            color: "#fff",
            cursor: "pointer",
            opacity: 0,
            transition: "opacity 0.15s",
          }}
          aria-label="Delete board"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Name area */}
      <div style={{ padding: "4px 6px" }}>
        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditName(entry.name);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-primary)",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--accent)",
              outline: "none",
              padding: 0,
            }}
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditName(entry.name);
              setEditing(true);
            }}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: "16px",
            }}
            title={entry.name}
          >
            {entry.name}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Board Panel ────────────────────────────────────────────────

export default function BoardPanel() {
  const panelOpen = useBoardStore((s) => s.panelOpen);
  const togglePanel = useBoardStore((s) => s.togglePanel);
  const boards = useBoardStore((s) => s.boards);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const initialized = useBoardStore((s) => s.initialized);
  const refreshBoards = useBoardStore((s) => s.refreshBoards);
  const switchBoard = useBoardStore((s) => s.switchBoard);
  const createBoard = useBoardStore((s) => s.createBoard);
  const deleteBoard = useBoardStore((s) => s.deleteBoard);
  const renameBoard = useBoardStore((s) => s.renameBoard);
  const setThumbnail = useBoardStore((s) => s.setThumbnail);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize on mount
  useEffect(() => {
    if (!initialized) {
      refreshBoards();
    }
  }, [initialized, refreshBoards]);

  // Generate thumbnail for active board when panel opens or board changes
  const elements = useDocumentStore((s) => s.board.elements);

  const updateActiveThumbnail = useCallback(() => {
    if (!activeBoardId) return;
    const thumb = generateThumbnail(elements);
    if (thumb) {
      setThumbnail(activeBoardId, thumb);
    }
  }, [activeBoardId, elements, setThumbnail]);

  useEffect(() => {
    if (panelOpen) {
      updateActiveThumbnail();
    }
  }, [panelOpen, updateActiveThumbnail]);

  // Inject hover styles for delete button
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .board-card:hover .board-delete-btn { opacity: 0.7 !important; }
      .board-card:hover .board-delete-btn:hover { opacity: 1 !important; background-color: rgba(220,38,38,0.8) !important; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const panelHeight = panelOpen ? CARD_H + 30 + 20 : 0; // card + name + padding

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        pointerEvents: "none",
      }}
    >
      {/* Board strip — full width */}
      <div
        style={{
          height: panelOpen ? panelHeight : 0,
          overflow: "hidden",
          transition: "height 0.2s ease",
          backgroundColor: "var(--bg-secondary)",
          borderBottom: panelOpen ? "1px solid var(--border)" : "none",
          pointerEvents: "auto",
        }}
      >
        <div
          ref={scrollRef}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: "100%",
            padding: "10px 16px",
            overflowX: "auto",
            overflowY: "hidden",
            scrollbarWidth: "thin",
          }}
        >
          {/* + New Board is always the first card */}
          <NewBoardCard onCreate={() => createBoard()} />

          {[...boards]
            .sort((a, b) => b.lastModified - a.lastModified)
            .map((entry) => (
              <BoardCard
                key={entry.id}
                entry={entry}
                isActive={entry.id === activeBoardId}
                onSelect={() => switchBoard(entry.id)}
                onDelete={() => deleteBoard(entry.id)}
                onRename={(name) => renameBoard(entry.id, name)}
              />
            ))}
        </div>
      </div>

      {/* Toggle button — always at top-right, below the strip */}
      <button
        onClick={togglePanel}
        style={{
          alignSelf: "flex-end",
          marginRight: 16,
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 18px",
          minHeight: 44,
          borderRadius: "0 0 10px 10px",
          border: "1px solid var(--border)",
          borderTop: "none",
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "background-color 0.15s",
          boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
          pointerEvents: "auto",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor =
            "color-mix(in srgb, var(--text-primary) 8%, var(--bg-secondary))";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
        }}
        aria-label={panelOpen ? "Hide boards" : "Show boards"}
      >
        <span>Boards</span>
        {panelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>
  );
}
