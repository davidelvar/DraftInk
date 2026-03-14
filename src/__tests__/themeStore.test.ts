import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "../store/themeStore";

describe("themeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({
      mode: "system",
      resolved: "light", // matchMedia mock returns false (light)
    });
  });

  it("initializes with system mode", () => {
    expect(useThemeStore.getState().mode).toBe("system");
  });

  it("setMode to light sets mode and resolves to light", () => {
    useThemeStore.getState().setMode("light");
    expect(useThemeStore.getState().mode).toBe("light");
    expect(useThemeStore.getState().resolved).toBe("light");
  });

  it("setMode to dark sets mode and resolves to dark", () => {
    useThemeStore.getState().setMode("dark");
    expect(useThemeStore.getState().mode).toBe("dark");
    expect(useThemeStore.getState().resolved).toBe("dark");
  });

  it("persists mode to localStorage", () => {
    useThemeStore.getState().setMode("dark");
    expect(localStorage.getItem("draftink-theme")).toBe("dark");
  });

  it("setMode to system resolves based on matchMedia", () => {
    // Our mock matchMedia returns matches: false → light
    useThemeStore.getState().setMode("system");
    expect(useThemeStore.getState().resolved).toBe("light");
  });

  it("cycles through modes correctly", () => {
    useThemeStore.getState().setMode("light");
    expect(useThemeStore.getState().resolved).toBe("light");

    useThemeStore.getState().setMode("dark");
    expect(useThemeStore.getState().resolved).toBe("dark");

    useThemeStore.getState().setMode("system");
    expect(useThemeStore.getState().mode).toBe("system");
  });
});
