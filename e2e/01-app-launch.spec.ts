import { waitForCanvas, dismissHomeScreen } from "./helpers";

describe("App Launch", () => {
  it("should launch the app and display the home screen", async () => {
    // The app should load within a reasonable time
    const body = await $("body");
    await body.waitForExist({ timeout: 15000 });

    // Home screen or canvas should be displayed
    const root = await $("div.relative");
    expect(await root.isDisplayed()).toBe(true);
  });

  it("should show the canvas after entering a board", async () => {
    await dismissHomeScreen();
    await waitForCanvas();

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should display the toolbar when on a board", async () => {
    // Toolbar should be visible (contains tool buttons with aria-labels)
    const penBtn = await $('[aria-label="Pen"]');
    expect(await penBtn.isDisplayed()).toBe(true);
  });

  it("should display the top bar with action buttons", async () => {
    // TopBar should contain zoom controls and file operations
    const zoomInBtn = await $('[aria-label="Zoom in"]');
    expect(await zoomInBtn.isDisplayed()).toBe(true);
  });
});
