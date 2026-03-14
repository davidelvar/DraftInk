import { useEffect, useRef, useCallback, useState } from "react";
import { Search, X, ChevronUp, ChevronDown, FileText, StickyNote } from "lucide-react";
import { useSearchStore, type CrossBoardMatch } from "../store/searchStore";
import { useViewportUIStore } from "../store/viewportUIStore";
import { useBoardStore } from "../store/boardStore";

// ─── Helpers ────────────────────────────────────────────────────

/** Get a text snippet around the first occurrence of the query. */
function getSnippet(text: string, query: string, maxLen = 60): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, maxLen);

  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + query.length + 20);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet += "…";
  return snippet;
}

/** Highlight matching text in a snippet. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0;

  let idx = lower.indexOf(qLower, last);
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(
      <mark
        key={idx}
        style={{
          backgroundColor: "var(--accent)",
          color: "#ffffff",
          borderRadius: 2,
          padding: "0 2px",
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    last = idx + query.length;
    idx = lower.indexOf(qLower, last);
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ─── Component ──────────────────────────────────────────────────

export default function SearchPanel() {
  const open = useSearchStore((s) => s.open);
  const mode = useSearchStore((s) => s.mode);
  const query = useSearchStore((s) => s.query);
  const matches = useSearchStore((s) => s.matches);
  const activeMatchIndex = useSearchStore((s) => s.activeMatchIndex);
  const crossBoardResults = useSearchStore((s) => s.crossBoardResults);
  const crossBoardLoading = useSearchStore((s) => s.crossBoardLoading);

  const setQuery = useSearchStore((s) => s.setQuery);
  const setMode = useSearchStore((s) => s.setMode);
  const closeSearch = useSearchStore((s) => s.closeSearch);
  const nextMatch = useSearchStore((s) => s.nextMatch);
  const prevMatch = useSearchStore((s) => s.prevMatch);
  const goToMatch = useSearchStore((s) => s.goToMatch);
  const searchAllBoards = useSearchStore((s) => s.searchAllBoards);

  const inputRef = useRef<HTMLInputElement>(null);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, mode]);

  // Pan to active match
  useEffect(() => {
    if (mode !== "board" || activeMatchIndex < 0) return;
    const match = matches[activeMatchIndex];
    if (!match) return;
    useViewportUIStore.getState().panTo(match.x, match.y);
  }, [activeMatchIndex, matches, mode]);

  // Escape to close (capture phase)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, closeSearch]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (mode === "global") {
        // Debounce cross-board search
        if (debounceTimer) clearTimeout(debounceTimer);
        const timer = setTimeout(() => {
          searchAllBoards();
        }, 300);
        setDebounceTimer(timer);
      }
    },
    [setQuery, mode, searchAllBoards, debounceTimer],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (mode === "board") {
          if (e.shiftKey) prevMatch();
          else nextMatch();
        } else if (mode === "global") {
          searchAllBoards();
        }
      }
      if (e.key === "F3" || (e.key === "g" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        if (e.shiftKey) prevMatch();
        else nextMatch();
      }
    },
    [mode, nextMatch, prevMatch, searchAllBoards],
  );

  const handleBoardResultClick = useCallback(
    (index: number) => {
      goToMatch(index);
    },
    [goToMatch],
  );

  const handleCrossBoardResultClick = useCallback(
    async (result: CrossBoardMatch) => {
      const { boardPath, x, y } = result;
      const boardStore = useBoardStore.getState();
      const entry = boardStore.boards.find((b) => b.filePath === boardPath);

      if (entry) {
        // If it's a different board, switch to it
        if (entry.id !== boardStore.activeBoardId) {
          await boardStore.switchBoard(entry.id);
        }
        // Pan to the matching element
        // Small delay to let the board finish loading
        setTimeout(() => {
          useViewportUIStore.getState().panTo(x, y);
        }, 100);
      }
      closeSearch();
    },
    [closeSearch],
  );

  if (!open) return null;

  // Group cross-board results by board name
  const groupedResults = new Map<string, CrossBoardMatch[]>();
  for (const r of crossBoardResults) {
    const list = groupedResults.get(r.boardPath) ?? [];
    list.push(r);
    groupedResults.set(r.boardPath, list);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSearch();
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          width: "min(520px, calc(100vw - 48px))",
          maxHeight: "min(520px, calc(100vh - 120px))",
          boxShadow: "0 25px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        {/* Search input row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
          }}
        >
          <Search size={18} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "board" ? "Search in this board…" : "Search across all boards…"}
            style={{
              flex: 1,
              background: "transparent",
              fontSize: 15,
              outline: "none",
              border: "none",
              color: "var(--text-primary)",
              minWidth: 0,
            }}
            autoFocus
          />

          {/* Match count badge (in-board) */}
          {mode === "board" && query && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
                padding: "0 6px",
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {matches.length > 0 ? `${activeMatchIndex + 1}/${matches.length}` : "No results"}
            </span>
          )}

          {/* Prev/Next (in-board) */}
          {mode === "board" && matches.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={prevMatch}
                style={{
                  display: "flex",
                  height: 28,
                  width: 28,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "color-mix(in srgb, var(--text-primary) 8%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                aria-label="Previous match"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={nextMatch}
                style={{
                  display: "flex",
                  height: 28,
                  width: 28,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "color-mix(in srgb, var(--text-primary) 8%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                aria-label="Next match"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          )}

          {/* Mode tabs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderRadius: 8,
              padding: 2,
              backgroundColor: "color-mix(in srgb, var(--text-primary) 6%, transparent)",
            }}
          >
            <button
              onClick={() => setMode("board")}
              style={{
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                backgroundColor: mode === "board" ? "var(--accent)" : "transparent",
                color: mode === "board" ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              Board
            </button>
            <button
              onClick={() => setMode("global")}
              style={{
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                backgroundColor: mode === "global" ? "var(--accent)" : "transparent",
                color: mode === "global" ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              All
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={closeSearch}
            style={{
              display: "flex",
              height: 28,
              width: 28,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "color-mix(in srgb, var(--text-primary) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Close search"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results list */}
        {query && (
          <div
            style={{
              maxHeight: 340,
              overflowY: "auto",
              borderTop: "1px solid var(--border)",
            }}
          >
            {mode === "board" && (
              <>
                {matches.length === 0 ? (
                  <div
                    style={{
                      padding: "24px 16px",
                      textAlign: "center",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    No matching text found in this board
                  </div>
                ) : (
                  matches.map((match, i) => (
                    <button
                      key={match.elementId}
                      onClick={() => handleBoardResultClick(i)}
                      style={{
                        display: "flex",
                        width: "100%",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "10px 16px",
                        textAlign: "left",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor:
                          i === activeMatchIndex
                            ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                            : "transparent",
                        borderLeft:
                          i === activeMatchIndex
                            ? "2px solid var(--accent)"
                            : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (i !== activeMatchIndex)
                          e.currentTarget.style.backgroundColor =
                            "color-mix(in srgb, var(--text-primary) 4%, transparent)";
                      }}
                      onMouseLeave={(e) => {
                        if (i !== activeMatchIndex)
                          e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      {match.type === "sticky" ? (
                        <StickyNote
                          size={14}
                          style={{
                            color: "var(--text-secondary)",
                            marginTop: 2,
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <FileText
                          size={14}
                          style={{
                            color: "var(--text-secondary)",
                            marginTop: 2,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span
                        style={{
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: "var(--text-primary)",
                        }}
                      >
                        <HighlightedText text={getSnippet(match.text, query)} query={query} />
                      </span>
                    </button>
                  ))
                )}
              </>
            )}

            {mode === "global" && (
              <>
                {crossBoardLoading ? (
                  <div
                    style={{
                      padding: "24px 16px",
                      textAlign: "center",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Searching…
                  </div>
                ) : crossBoardResults.length === 0 ? (
                  <div
                    style={{
                      padding: "24px 16px",
                      textAlign: "center",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    No matching text found across boards
                  </div>
                ) : (
                  Array.from(groupedResults.entries()).map(([boardPath, boardMatches]) => (
                    <div key={boardPath}>
                      {/* Board name header */}
                      <div
                        style={{
                          position: "sticky",
                          top: 0,
                          padding: "8px 16px",
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--text-secondary)",
                          backgroundColor: "var(--bg-secondary)",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        {boardMatches[0].boardName}
                        <span
                          style={{
                            marginLeft: 8,
                            fontWeight: 400,
                            textTransform: "none",
                            opacity: 0.6,
                          }}
                        >
                          ({boardMatches.length} {boardMatches.length === 1 ? "match" : "matches"})
                        </span>
                      </div>
                      {boardMatches.map((result, i) => (
                        <button
                          key={`${result.boardPath}-${result.elementId}-${i}`}
                          onClick={() => handleCrossBoardResultClick(result)}
                          style={{
                            display: "flex",
                            width: "100%",
                            alignItems: "flex-start",
                            gap: 12,
                            padding: "10px 16px",
                            textAlign: "left",
                            border: "none",
                            cursor: "pointer",
                            backgroundColor: "transparent",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "color-mix(in srgb, var(--text-primary) 4%, transparent)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          {result.type === "sticky" ? (
                            <StickyNote
                              size={14}
                              style={{
                                color: "var(--text-secondary)",
                                marginTop: 2,
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <FileText
                              size={14}
                              style={{
                                color: "var(--text-secondary)",
                                marginTop: 2,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <span
                            style={{
                              fontSize: 13,
                              lineHeight: 1.6,
                              color: "var(--text-primary)",
                            }}
                          >
                            <HighlightedText text={getSnippet(result.text, query)} query={query} />
                          </span>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
