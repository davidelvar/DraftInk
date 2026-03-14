import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Download, X, RefreshCw } from "lucide-react";

type Status = "idle" | "available" | "downloading" | "ready" | "error";

export default function UpdateChecker() {
  const [status, setStatus] = useState<Status>("idle");
  const [version, setVersion] = useState("");
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  useEffect(() => {
    // Delay check so it doesn't compete with app startup
    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (update) {
          setVersion(update.version);
          setPendingUpdate(update);
          setStatus("available");
        }
      } catch {
        // Silently ignore — updater may not be configured yet (no pubkey)
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleInstall = async () => {
    if (!pendingUpdate) return;
    setStatus("downloading");
    setProgress(0);
    try {
      let totalLength = 0;
      let downloaded = 0;

      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalLength = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            setProgress(Math.round((downloaded / totalLength) * 100));
          }
        } else if (event.event === "Finished") {
          setStatus("ready");
        }
      });

      // downloadAndInstall restarts the app on success,
      // so this line is only reached if restart didn't happen
      setStatus("ready");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  if (status === "idle" || dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 12,
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        maxWidth: 380,
      }}
    >
      {/* Icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
          flexShrink: 0,
        }}
      >
        {status === "downloading" ? (
          <RefreshCw
            size={18}
            style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }}
          />
        ) : (
          <Download size={18} style={{ color: "var(--accent)" }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {status === "available" && (
          <>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Update available
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginTop: 2,
              }}
            >
              Version {version} is ready to download
            </div>
          </>
        )}

        {status === "downloading" && (
          <>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Downloading update…
            </div>
            <div
              style={{
                marginTop: 6,
                height: 4,
                borderRadius: 2,
                backgroundColor: "color-mix(in srgb, var(--text-primary) 10%, transparent)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  backgroundColor: "var(--accent)",
                  borderRadius: 2,
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </>
        )}

        {status === "ready" && (
          <>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Update installed
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginTop: 2,
              }}
            >
              Restart the app to use v{version}
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Update failed
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {errorMsg}
            </div>
          </>
        )}
      </div>

      {/* Action button */}
      {status === "available" && (
        <button
          onClick={handleInstall}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            backgroundColor: "var(--accent)",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Install
        </button>
      )}

      {/* Dismiss */}
      {status !== "downloading" && (
        <button
          onClick={() => setDismissed(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            flexShrink: 0,
          }}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
