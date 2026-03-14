import { useEffect } from "react";
import { useToolStore } from "../store/toolStore";
import { useHistoryStore } from "../store/historyStore";
import { useFileStore } from "../store/fileStore";
import { useDocumentStore } from "../store/documentStore";
import { useViewportUIStore } from "../store/viewportUIStore";
import { useSearchStore } from "../store/searchStore";
import { exportPNG } from "../utils/export";
import { generateId } from "../utils/id";
import {
  insertImageElement,
  binaryToDataUrl,
  mimeTypeFromPath,
  IMAGE_EXTENSIONS,
} from "../utils/image";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { CanvasElement } from "../types/document";

/** Shortcut definition for the help overlay. */
export interface ShortcutEntry {
  keys: string;
  description: string;
  section: string;
}

export const SHORTCUT_MAP: ShortcutEntry[] = [
  // Tools
  { keys: "V", description: "Select tool", section: "Tools" },
  { keys: "P", description: "Pen tool", section: "Tools" },
  { keys: "E", description: "Eraser tool", section: "Tools" },
  { keys: "H", description: "Highlighter tool", section: "Tools" },
  { keys: "T", description: "Text tool", section: "Tools" },
  { keys: "R", description: "Rectangle tool", section: "Tools" },
  { keys: "O", description: "Ellipse tool", section: "Tools" },
  { keys: "L", description: "Line tool", section: "Tools" },
  { keys: "A", description: "Arrow tool", section: "Tools" },
  { keys: "N", description: "Sticky note tool", section: "Tools" },
  { keys: "C", description: "Connector tool", section: "Tools" },
  { keys: "Ctrl+Shift+I", description: "Insert image", section: "Tools" },

  // File
  { keys: "Ctrl+N", description: "New board", section: "File" },
  { keys: "Ctrl+O", description: "Open file", section: "File" },
  { keys: "Ctrl+S", description: "Save file", section: "File" },
  { keys: "Ctrl+Shift+S", description: "Save as", section: "File" },
  { keys: "Ctrl+Shift+E", description: "Export as PNG", section: "File" },
  { keys: "Ctrl+X", description: "Cut selected", section: "Edit" },
  { keys: "Ctrl+C", description: "Copy selected", section: "Edit" },
  { keys: "Ctrl+V", description: "Paste", section: "Edit" },
  { keys: "Ctrl+D", description: "Duplicate selected", section: "Edit" },

  // Layers
  { keys: "Ctrl+]", description: "Bring forward", section: "Layers" },
  { keys: "Ctrl+[", description: "Send backward", section: "Layers" },
  { keys: "Ctrl+Shift+]", description: "Bring to front", section: "Layers" },
  { keys: "Ctrl+Shift+[", description: "Send to back", section: "Layers" },

  // Edit
  { keys: "Ctrl+Z", description: "Undo", section: "Edit" },
  { keys: "Ctrl+Shift+Z", description: "Redo", section: "Edit" },
  { keys: "Ctrl+Y", description: "Redo", section: "Edit" },
  { keys: "Ctrl+A", description: "Select all", section: "Edit" },
  { keys: "Delete", description: "Delete selected", section: "Edit" },
  { keys: "Backspace", description: "Delete selected", section: "Edit" },
  { keys: "Escape", description: "Deselect all", section: "Edit" },
  { keys: "Ctrl+F", description: "Search in board", section: "Edit" },
  { keys: "Ctrl+Shift+F", description: "Search all boards", section: "Edit" },

  // View
  { keys: "Ctrl+=", description: "Zoom in", section: "View" },
  { keys: "Ctrl+-", description: "Zoom out", section: "View" },
  { keys: "Ctrl+0", description: "Reset zoom", section: "View" },
  { keys: "Ctrl+G", description: "Toggle grid", section: "View" },
  { keys: "Ctrl+Shift+G", description: "Toggle snap to grid", section: "View" },
  { keys: "M", description: "Toggle minimap", section: "View" },
  { keys: "F5", description: "Presentation mode", section: "View" },
  { keys: "Space+Drag", description: "Pan canvas", section: "View" },

  // Other
  { keys: "?", description: "Show shortcuts help", section: "Help" },
];

function isTextField(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === "TEXTAREA" || tag === "INPUT";
}

// ─── Internal clipboard for copy/paste ──────────────────────────
let elementClipboard: CanvasElement[] = [];
let clipboardPasteCount = 0;

/** Read the current internal clipboard contents. */
export function getClipboard(): CanvasElement[] {
  return elementClipboard;
}

/** Set the internal clipboard and reset paste count. */
export function setClipboard(elements: CanvasElement[]): void {
  elementClipboard = elements;
  clipboardPasteCount = 0;
}

/** Increment and return the paste count (for offset positioning). */
export function incrementPasteCount(): number {
  return ++clipboardPasteCount;
}

/**
 * Central keyboard shortcut handler. Attach once in App.
 */
export function useKeyboardShortcuts(onToggleHelp: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key;
      const keyLower = key.toLowerCase();

      // F5 — toggle presentation mode (works regardless of modifier state)
      if (key === "F5") {
        e.preventDefault();
        const vui = useViewportUIStore.getState();
        if (vui.presentationMode) {
          // Restore previous tool
          const prevTool = vui.prePresentationTool;
          vui.exitPresentationMode();
          if (prevTool) {
            useToolStore.getState().setTool(prevTool);
          }
        } else {
          // Save current tool and switch to hand
          const currentTool = useToolStore.getState().activeTool;
          useViewportUIStore.setState({ prePresentationTool: currentTool });
          vui.enterPresentationMode();
          useToolStore.getState().setTool("hand");
        }
        return;
      }

      // ── Modifier shortcuts (work even in text fields for file ops) ──
      if (ctrl) {
        // File
        if (keyLower === "n" && !shift) {
          e.preventDefault();
          useFileStore.getState().newFile();
          return;
        }
        if (keyLower === "o" && !shift) {
          e.preventDefault();
          useFileStore.getState().openFile();
          return;
        }
        if (keyLower === "s" && !shift) {
          e.preventDefault();
          useFileStore.getState().saveFile();
          return;
        }
        if (keyLower === "s" && shift) {
          e.preventDefault();
          useFileStore.getState().saveFileAs();
          return;
        }

        // Export
        if (keyLower === "e" && shift) {
          e.preventDefault();
          exportPNG();
          return;
        }

        // Insert image: Ctrl+Shift+I
        if (keyLower === "i" && shift) {
          e.preventDefault();
          (async () => {
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
          })();
          return;
        }

        // Z-order: Ctrl+] / Ctrl+[ / Ctrl+Shift+] / Ctrl+Shift+[
        if (key === "]" || key === "}") {
          e.preventDefault();
          const store = useDocumentStore.getState();
          if (store.selectedIds.size > 0) {
            useHistoryStore.getState().pushSnapshot();
            if (shift) {
              store.bringToFront([...store.selectedIds]);
            } else {
              store.bringForward([...store.selectedIds]);
            }
          }
          return;
        }
        if (key === "[" || key === "{") {
          e.preventDefault();
          const store = useDocumentStore.getState();
          if (store.selectedIds.size > 0) {
            useHistoryStore.getState().pushSnapshot();
            if (shift) {
              store.sendToBack([...store.selectedIds]);
            } else {
              store.sendBackward([...store.selectedIds]);
            }
          }
          return;
        }

        // Search: Ctrl+F / Ctrl+Shift+F (works even in text fields)
        if (keyLower === "f" && !shift) {
          e.preventDefault();
          useSearchStore.getState().openSearch("board");
          return;
        }
        if (keyLower === "f" && shift) {
          e.preventDefault();
          useSearchStore.getState().openSearch("global");
          return;
        }

        // Below this, skip if typing in a text field
        if (isTextField()) return;

        // Undo
        if (keyLower === "z" && !shift) {
          e.preventDefault();
          useHistoryStore.getState().undo();
          return;
        }
        // Redo: Ctrl+Shift+Z or Ctrl+Y
        if ((keyLower === "z" && shift) || keyLower === "y") {
          e.preventDefault();
          useHistoryStore.getState().redo();
          return;
        }
        // Select all
        if (keyLower === "a") {
          e.preventDefault();
          useDocumentStore.getState().selectAll();
          return;
        }
        // Cut selected elements
        if (keyLower === "x" && !shift) {
          const store = useDocumentStore.getState();
          if (store.selectedIds.size > 0) {
            e.preventDefault();
            const selected = store.board.elements
              .filter((el) => store.selectedIds.has(el.id))
              .map((el) => structuredClone(el));
            setClipboard(selected);
            useHistoryStore.getState().pushSnapshot();
            store.removeElements([...store.selectedIds]);
          }
          return;
        }
        // Copy selected elements
        if (keyLower === "c" && !shift) {
          const store = useDocumentStore.getState();
          if (store.selectedIds.size > 0) {
            e.preventDefault();
            const selected = store.board.elements
              .filter((el) => store.selectedIds.has(el.id))
              .map((el) => structuredClone(el));
            setClipboard(selected);
          }
          return;
        }
        // Paste elements
        if (keyLower === "v" && !shift) {
          const clip = getClipboard();
          if (clip.length > 0) {
            e.preventDefault();
            const offset = incrementPasteCount() * 20;
            useHistoryStore.getState().pushSnapshot();
            const newElements = clip.map((el) => ({
              ...structuredClone(el),
              id: generateId(),
              position: { x: el.position.x + offset, y: el.position.y + offset },
            }));
            const store = useDocumentStore.getState();
            store.addElements(newElements);
            store.clearSelection();
            store.select(newElements.map((el) => el.id));
          }
          return;
        }
        // Duplicate selected elements
        if (keyLower === "d" && !shift) {
          const store = useDocumentStore.getState();
          if (store.selectedIds.size > 0) {
            e.preventDefault();
            useHistoryStore.getState().pushSnapshot();
            const selectedEls = store.board.elements.filter((el) => store.selectedIds.has(el.id));
            const newElements = selectedEls.map((el) => ({
              ...structuredClone(el),
              id: generateId(),
              position: { x: el.position.x + 20, y: el.position.y + 20 },
            }));
            store.addElements(newElements);
            store.clearSelection();
            store.select(newElements.map((el) => el.id));
          }
          return;
        }
        // Zoom in: Ctrl+= or Ctrl++
        if (key === "=" || key === "+") {
          e.preventDefault();
          useViewportUIStore.getState().zoomBy(-200);
          return;
        }
        // Zoom out: Ctrl+-
        if (key === "-") {
          e.preventDefault();
          useViewportUIStore.getState().zoomBy(200);
          return;
        }
        // Reset zoom: Ctrl+0
        if (key === "0") {
          e.preventDefault();
          useViewportUIStore.getState().resetZoom();
          return;
        }
        // Toggle grid: Ctrl+G / Toggle snap: Ctrl+Shift+G
        if (keyLower === "g") {
          e.preventDefault();
          if (shift) {
            useViewportUIStore.getState().toggleSnapToGrid();
          } else {
            useViewportUIStore.getState().toggleGrid();
          }
          return;
        }

        return;
      }

      // ── Non-modifier shortcuts (skip in text fields) ──
      if (isTextField()) return;
      if (e.altKey) return;

      // Help overlay
      if (key === "?" || (shift && key === "/")) {
        e.preventDefault();
        onToggleHelp();
        return;
      }

      // Escape — exit presentation mode, or close help, or deselect
      if (key === "Escape") {
        const vui = useViewportUIStore.getState();
        if (vui.presentationMode) {
          const prevTool = vui.prePresentationTool;
          vui.exitPresentationMode();
          if (prevTool) {
            useToolStore.getState().setTool(prevTool);
          }
          return;
        }
        useDocumentStore.getState().clearSelection();
        return;
      }

      // Tool switching
      switch (keyLower) {
        case "v":
          useToolStore.getState().setTool("select");
          break;
        case "h":
          useToolStore.getState().setTool("highlighter");
          break;
        case "p":
          useToolStore.getState().setTool("pen");
          break;
        case "e":
          useToolStore.getState().setTool("eraser");
          break;
        case "t":
          useToolStore.getState().setTool("text");
          break;
        case "r":
          useToolStore.getState().setTool("rectangle");
          break;
        case "o":
          useToolStore.getState().setTool("ellipse");
          break;
        case "l":
          useToolStore.getState().setTool("line");
          break;
        case "a":
          useToolStore.getState().setTool("arrow");
          break;
        case "n":
          useToolStore.getState().setTool("sticky");
          break;
        case "c":
          useToolStore.getState().setTool("connector");
          break;
        case "m":
          useViewportUIStore.getState().toggleMinimap();
          break;
        default:
          return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onToggleHelp]);
}
