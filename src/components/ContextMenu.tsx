import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../store/documentStore";
import { useHistoryStore } from "../store/historyStore";
import { generateId } from "../utils/id";
import { getClipboard, setClipboard, incrementPasteCount } from "../hooks/useKeyboardShortcuts";

export interface ContextMenuState {
  x: number;
  y: number;
  target: "element" | "background";
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onZoomToFit: () => void;
  requestRender: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export default function ContextMenu({
  state,
  onClose,
  onZoomToFit,
  requestRender,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  // Adjust position to keep in viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = state;
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 4;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 4;
    }
    setPos({ x, y });
  }, [state]);

  // Click outside to close
  useEffect(() => {
    const handle = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  const store = useDocumentStore.getState();
  const clipboard = getClipboard();
  const hasClipboard = clipboard.length > 0;
  const hasElements = store.board.elements.length > 0;

  const items: (MenuItem | "separator")[] = [];

  if (state.target === "element") {
    items.push(
      {
        label: "Cut",
        shortcut: "Ctrl+X",
        action: () => {
          const s = useDocumentStore.getState();
          if (s.selectedIds.size === 0) return;
          const selected = s.board.elements.filter((el) => s.selectedIds.has(el.id));
          setClipboard(selected.map((el) => structuredClone(el)));
          useHistoryStore.getState().pushSnapshot();
          s.removeElements([...s.selectedIds]);
          requestRender();
          onClose();
        },
      },
      {
        label: "Copy",
        shortcut: "Ctrl+C",
        action: () => {
          const s = useDocumentStore.getState();
          if (s.selectedIds.size === 0) return;
          const selected = s.board.elements.filter((el) => s.selectedIds.has(el.id));
          setClipboard(selected.map((el) => structuredClone(el)));
          onClose();
        },
      },
      {
        label: "Paste",
        shortcut: "Ctrl+V",
        disabled: !hasClipboard,
        action: () => {
          if (!hasClipboard) return;
          const offset = incrementPasteCount() * 20;
          useHistoryStore.getState().pushSnapshot();
          const newElements = clipboard.map((el) => ({
            ...structuredClone(el),
            id: generateId(),
            position: {
              x: el.position.x + offset,
              y: el.position.y + offset,
            },
          }));
          const s = useDocumentStore.getState();
          s.addElements(newElements);
          s.clearSelection();
          s.select(newElements.map((el) => el.id));
          requestRender();
          onClose();
        },
      },
      {
        label: "Duplicate",
        shortcut: "Ctrl+D",
        action: () => {
          const s = useDocumentStore.getState();
          if (s.selectedIds.size === 0) return;
          useHistoryStore.getState().pushSnapshot();
          const selected = s.board.elements.filter((el) => s.selectedIds.has(el.id));
          const newElements = selected.map((el) => ({
            ...structuredClone(el),
            id: generateId(),
            position: {
              x: el.position.x + 20,
              y: el.position.y + 20,
            },
          }));
          s.addElements(newElements);
          s.clearSelection();
          s.select(newElements.map((el) => el.id));
          requestRender();
          onClose();
        },
      },
      {
        label: "Delete",
        shortcut: "Del",
        danger: true,
        action: () => {
          const s = useDocumentStore.getState();
          if (s.selectedIds.size === 0) return;
          useHistoryStore.getState().pushSnapshot();
          s.removeElements([...s.selectedIds]);
          requestRender();
          onClose();
        },
      },
      "separator",
      {
        label: "Bring to Front",
        shortcut: "Ctrl+Shift+]",
        action: () => {
          const s = useDocumentStore.getState();
          if (s.selectedIds.size === 0) return;
          useHistoryStore.getState().pushSnapshot();
          s.bringToFront([...s.selectedIds]);
          requestRender();
          onClose();
        },
      },
      {
        label: "Bring Forward",
        shortcut: "Ctrl+]",
        action: () => {
          const s = useDocumentStore.getState();
          if (s.selectedIds.size === 0) return;
          useHistoryStore.getState().pushSnapshot();
          s.bringForward([...s.selectedIds]);
          requestRender();
          onClose();
        },
      },
      {
        label: "Send Backward",
        shortcut: "Ctrl+[",
        action: () => {
          const s = useDocumentStore.getState();
          if (s.selectedIds.size === 0) return;
          useHistoryStore.getState().pushSnapshot();
          s.sendBackward([...s.selectedIds]);
          requestRender();
          onClose();
        },
      },
      {
        label: "Send to Back",
        shortcut: "Ctrl+Shift+[",
        action: () => {
          const s = useDocumentStore.getState();
          if (s.selectedIds.size === 0) return;
          useHistoryStore.getState().pushSnapshot();
          s.sendToBack([...s.selectedIds]);
          requestRender();
          onClose();
        },
      },
    );
  } else {
    items.push(
      {
        label: "Paste",
        shortcut: "Ctrl+V",
        disabled: !hasClipboard,
        action: () => {
          if (!hasClipboard) return;
          const offset = incrementPasteCount() * 20;
          useHistoryStore.getState().pushSnapshot();
          const newElements = clipboard.map((el) => ({
            ...structuredClone(el),
            id: generateId(),
            position: {
              x: el.position.x + offset,
              y: el.position.y + offset,
            },
          }));
          const s = useDocumentStore.getState();
          s.addElements(newElements);
          s.clearSelection();
          s.select(newElements.map((el) => el.id));
          requestRender();
          onClose();
        },
      },
      {
        label: "Select All",
        shortcut: "Ctrl+A",
        disabled: !hasElements,
        action: () => {
          useDocumentStore.getState().selectAll();
          requestRender();
          onClose();
        },
      },
      {
        label: "Zoom to Fit",
        disabled: !hasElements,
        action: () => {
          onZoomToFit();
          onClose();
        },
      },
    );
  }

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        zIndex: 50,
        minWidth: 200,
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        padding: "4px 0",
        pointerEvents: "auto",
      }}
    >
      {items.map((item, i) => {
        if (item === "separator") {
          return (
            <div
              key={i}
              style={{
                height: 1,
                backgroundColor: "var(--border)",
                margin: "4px 0",
              }}
            />
          );
        }
        return (
          <button
            key={i}
            onClick={item.action}
            disabled={item.disabled}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "6px 12px",
              border: "none",
              background: "transparent",
              color: item.disabled
                ? "var(--text-secondary)"
                : item.danger
                  ? "#ef4444"
                  : "var(--text-primary)",
              cursor: item.disabled ? "default" : "pointer",
              fontSize: 13,
              fontFamily: "Inter, system-ui, sans-serif",
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  "color-mix(in srgb, var(--text-primary) 8%, transparent)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span
                style={{
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  marginLeft: 24,
                }}
              >
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
