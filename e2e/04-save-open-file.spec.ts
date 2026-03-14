import { waitForCanvas, dismissHomeScreen, clickByLabel, drawStroke } from "./helpers";

describe("Save and Open Board File", () => {
  before(async () => {
    await dismissHomeScreen();
    await waitForCanvas();
  });

  it("should draw content before saving", async () => {
    // Select pen and draw a stroke so the board has content
    await clickByLabel("Pen");
    await drawStroke(200, 200, 500, 300, 8);
    await browser.pause(500);

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should have save functionality available", async () => {
    // The save button should be visible in the TopBar
    const saveBtn = await $('[aria-label="Save"]');
    expect(await saveBtn.isDisplayed()).toBe(true);
  });

  it("should trigger save via keyboard shortcut", async () => {
    // Ctrl+S triggers save — this should invoke the Tauri file dialog
    // In E2E context, the save dialog may appear; we verify no crash occurs
    await browser.keys(["Control", "s"]);
    await browser.pause(1000);

    // App should still be responsive after save attempt
    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should have open functionality available", async () => {
    // The open button should be visible in the TopBar
    const openBtn = await $('[aria-label="Open"]');
    expect(await openBtn.isDisplayed()).toBe(true);
  });

  it("should trigger new file via keyboard shortcut", async () => {
    // Ctrl+N triggers new file
    await browser.keys(["Control", "n"]);
    await browser.pause(1000);

    // Canvas should still be displayed
    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });
});
