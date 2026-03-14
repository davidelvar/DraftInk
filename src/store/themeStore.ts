import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  /** User-chosen mode: light, dark, or follow system. */
  mode: ThemeMode;
  /** The resolved effective theme (always "light" or "dark"). */
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const STORAGE_KEY = "draftink-theme";

function loadSavedMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") return saved;
  return "system";
}

const initialMode = loadSavedMode();

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode,
  resolved: resolveTheme(initialMode),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    set({ mode, resolved: resolveTheme(mode) });
  },
}));

// Listen for OS theme changes so "system" mode updates in real time
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { mode } = useThemeStore.getState();
  if (mode === "system") {
    useThemeStore.setState({ resolved: resolveTheme("system") });
  }
});
