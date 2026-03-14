import { useHistoryStore } from "../store/historyStore";

export default function UndoToast() {
  const message = useHistoryStore((s) => s.toastMessage);

  if (!message) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "var(--bg-secondary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "6px 16px",
        fontSize: 13,
        fontWeight: 500,
        zIndex: 100,
        pointerEvents: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      {message}
    </div>
  );
}
