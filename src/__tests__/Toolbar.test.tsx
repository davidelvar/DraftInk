import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Toolbar from "../components/Toolbar";
import { useToolStore } from "../store/toolStore";
import { useSettingsStore } from "../store/settingsStore";

describe("Toolbar", () => {
  beforeEach(() => {
    useToolStore.setState({
      activeTool: "pen",
      strokeColor: "#1f2937",
      strokeWidth: 2,
      fillColor: "transparent",
      fillOpacity: 1,
      eraserWidth: 20,
      fontSize: 16,
      fontFamily: "Inter, system-ui, sans-serif",
      bold: false,
      italic: false,
    });
    useSettingsStore.setState({
      visibleTools: new Set([
        "select",
        "hand",
        "pen",
        "eraser",
        "text",
        "rectangle",
        "ellipse",
        "line",
        "arrow",
      ]),
      toolbarPosition: "left",
    });
  });

  it("renders tool buttons", () => {
    render(<Toolbar />);
    expect(screen.getByLabelText("Select")).toBeInTheDocument();
    expect(screen.getByLabelText("Pen")).toBeInTheDocument();
    expect(screen.getByLabelText("Eraser")).toBeInTheDocument();
    expect(screen.getByLabelText("Text")).toBeInTheDocument();
    expect(screen.getByLabelText("Hand")).toBeInTheDocument();
  });

  it("switches tool on button click", () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByLabelText("Select"));
    expect(useToolStore.getState().activeTool).toBe("select");

    fireEvent.click(screen.getByLabelText("Eraser"));
    expect(useToolStore.getState().activeTool).toBe("eraser");

    fireEvent.click(screen.getByLabelText("Text"));
    expect(useToolStore.getState().activeTool).toBe("text");
  });

  it("highlights the active tool button", () => {
    useToolStore.setState({ activeTool: "select" });
    render(<Toolbar />);

    const selectBtn = screen.getByLabelText("Select");
    // Active tool gets var(--accent) background
    expect(selectBtn.style.backgroundColor).not.toBe("transparent");
  });

  it("respects visible tools from settings", () => {
    useSettingsStore.setState({
      visibleTools: new Set(["pen", "eraser"]),
    });
    render(<Toolbar />);

    expect(screen.getByLabelText("Pen")).toBeInTheDocument();
    expect(screen.getByLabelText("Eraser")).toBeInTheDocument();
    expect(screen.queryByLabelText("Select")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Text")).not.toBeInTheDocument();
  });
});
