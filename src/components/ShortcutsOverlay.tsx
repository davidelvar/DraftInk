import { useEffect, useRef } from "react";
import { SHORTCUT_MAP } from "../hooks/useKeyboardShortcuts";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = ["Tools", "File", "Edit", "View", "Help"] as const;

export default function ShortcutsOverlay({ open, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // Use capture so this fires before the central handler
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const grouped = new Map<string, typeof SHORTCUT_MAP>();
  for (const entry of SHORTCUT_MAP) {
    const list = grouped.get(entry.section) ?? [];
    list.push(entry);
    grouped.set(entry.section, list);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl p-4 sm:p-6 shadow-2xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 10%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Close"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-8">
          {SECTIONS.map((section) => {
            const entries = grouped.get(section);
            if (!entries) return null;

            // Deduplicate entries that share a description (e.g. Delete & Backspace)
            const seen = new Set<string>();
            const unique = entries.filter((e) => {
              if (seen.has(e.description)) return false;
              seen.add(e.description);
              return true;
            });

            return (
              <div key={section}>
                <h3
                  className="mb-1.5 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {section}
                </h3>
                <ul className="space-y-1">
                  {unique.map((entry) => (
                    <li
                      key={entry.keys}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span style={{ color: "var(--text-primary)" }}>{entry.description}</span>
                      <Kbd combo={entry.keys} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
          Press <Kbd combo="?" /> or <Kbd combo="Escape" /> to close
        </p>
      </div>
    </div>
  );
}

function Kbd({ combo }: { combo: string }) {
  const parts = combo.split("+");
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && (
            <span className="mx-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>
              +
            </span>
          )}
          <kbd
            className="inline-block min-w-[1.5em] rounded px-1.5 py-0.5 text-center text-xs font-medium"
            style={{
              backgroundColor: "color-mix(in srgb, var(--text-primary) 8%, transparent)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          >
            {part}
          </kbd>
        </span>
      ))}
    </span>
  );
}
