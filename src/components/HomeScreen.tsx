import { useEffect, useCallback, useState } from "react";
import { useBoardStore, type BoardEntry } from "../store/boardStore";
import { Plus, LayoutTemplate, Trash2 } from "lucide-react";
import TemplateGallery from "./TemplateGallery";

// ─── Card dimensions ────────────────────────────────────────────

const THUMB_W = 280;
const THUMB_H = 160;

// ─── Board Card ─────────────────────────────────────────────────

function RecentBoardCard({
  entry,
  onSelect,
  onDelete,
}: {
  entry: BoardEntry;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const dateStr = new Date(entry.lastModified * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      onClick={onSelect}
      className="home-board-card"
      style={{
        width: THUMB_W,
        borderRadius: 12,
        border: "2px solid var(--border)",
        backgroundColor: "var(--bg-secondary)",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
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
      {/* Thumbnail */}
      <div
        style={{
          width: "100%",
          height: THUMB_H,
          backgroundColor: "color-mix(in srgb, var(--bg-primary) 80%, var(--bg-secondary))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
          <span style={{ fontSize: 13, color: "var(--text-secondary)", opacity: 0.4 }}>Empty</span>
        )}

        {/* Delete button */}
        <button
          className="home-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 28,
            height: 28,
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
          aria-label="Delete board"
        >
          <Trash2 size={14} />
        </button>
      </div>

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
          title={entry.name}
        >
          {entry.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{dateStr}</div>
      </div>
    </div>
  );
}

// ─── Home Screen ────────────────────────────────────────────────

export default function HomeScreen({ onEnterBoard }: { onEnterBoard: () => void }) {
  const boards = useBoardStore((s) => s.boards);
  const initialized = useBoardStore((s) => s.initialized);
  const refreshBoards = useBoardStore((s) => s.refreshBoards);
  const switchBoard = useBoardStore((s) => s.switchBoard);
  const createBoard = useBoardStore((s) => s.createBoard);
  const deleteBoard = useBoardStore((s) => s.deleteBoard);

  const [showTemplates, setShowTemplates] = useState(false);

  // Load boards on mount
  useEffect(() => {
    refreshBoards();
  }, [refreshBoards]);

  // Inject hover styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .home-board-card:hover .home-delete-btn { opacity: 0.7 !important; }
      .home-board-card:hover .home-delete-btn:hover { opacity: 1 !important; background-color: rgba(220,38,38,0.8) !important; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const handleCreate = useCallback(async () => {
    await createBoard();
    onEnterBoard();
  }, [createBoard, onEnterBoard]);

  const handleSelect = useCallback(
    async (id: string) => {
      await switchBoard(id);
      onEnterBoard();
    },
    [switchBoard, onEnterBoard],
  );

  // Sort boards by most recent first
  const sortedBoards = [...boards].sort((a, b) => b.lastModified - a.lastModified);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 100,
        backgroundColor: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "auto",
      }}
    >
      {/* Header */}
      <div style={{ marginTop: 80, marginBottom: 40, textAlign: "center" }}>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 8,
          }}
        >
          DraftInk
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)" }}>
          Select a board or create a new one
        </p>
      </div>

      {/* New Board + From Template buttons */}
      <div style={{ display: "flex", gap: 12, marginBottom: 36 }}>
        <button
          onClick={handleCreate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 28px",
            borderRadius: 12,
            border: "2px dashed var(--border)",
            backgroundColor: "transparent",
            color: "var(--text-secondary)",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.color = "var(--accent)";
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--accent) 6%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Plus size={20} />
          New Board
        </button>

        <button
          onClick={() => setShowTemplates(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 28px",
            borderRadius: 12,
            border: "2px solid var(--border)",
            backgroundColor: "transparent",
            color: "var(--text-secondary)",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.color = "var(--accent)";
            e.currentTarget.style.backgroundColor =
              "color-mix(in srgb, var(--accent) 6%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <LayoutTemplate size={20} />
          From Template
        </button>
      </div>

      {/* Recent boards grid */}
      {!initialized ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading boards…</p>
      ) : sortedBoards.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          No boards yet. Create one to get started!
        </p>
      ) : (
        <>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 16,
              alignSelf: "center",
            }}
          >
            Recent Boards
          </h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
              justifyContent: "center",
              padding: "0 40px 60px 40px",
              maxWidth: 1200,
            }}
          >
            {sortedBoards.map((entry) => (
              <RecentBoardCard
                key={entry.id}
                entry={entry}
                onSelect={() => handleSelect(entry.id)}
                onDelete={() => deleteBoard(entry.id)}
              />
            ))}
          </div>
        </>
      )}

      <TemplateGallery
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onCreateBoard={onEnterBoard}
      />
    </div>
  );
}
