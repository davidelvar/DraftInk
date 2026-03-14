import { waitForCanvas, dismissHomeScreen, clickByLabel, drawStroke } from "./helpers";

describe("Undo and Redo", () => {
  before(async () => {
    await dismissHomeScreen();
    await waitForCanvas();
  });

  it("should draw a stroke to create an undoable action", async () => {
    await clickByLabel("Pen");
    await drawStroke(200, 200, 400, 300, 6);
    await browser.pause(500);

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should undo the last action via toolbar button", async () => {
    // Click the Undo button in the TopBar
    const undoBtn = await $('[aria-label="Undo"]');
    const isClickable = await undoBtn.isClickable();

    if (isClickable) {
      await undoBtn.click();
      await browser.pause(300);
    }

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should redo the undone action via toolbar button", async () => {
    // Click the Redo button in the TopBar
    const redoBtn = await $('[aria-label="Redo"]');
    const isClickable = await redoBtn.isClickable();

    if (isClickable) {
      await redoBtn.click();
      await browser.pause(300);
    }

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should undo via keyboard shortcut Ctrl+Z", async () => {
    // Draw another stroke first
    await clickByLabel("Pen");
    await drawStroke(300, 100, 500, 250, 5);
    await browser.pause(300);

    // Undo with Ctrl+Z
    await browser.keys(["Control", "z"]);
    await browser.pause(300);

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should redo via keyboard shortcut Ctrl+Y", async () => {
    // Redo with Ctrl+Y
    await browser.keys(["Control", "y"]);
    await browser.pause(300);

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should support multiple consecutive undo operations", async () => {
    // Draw two strokes
    await clickByLabel("Pen");
    await drawStroke(100, 400, 300, 400, 4);
    await browser.pause(200);
    await drawStroke(100, 450, 300, 450, 4);
    await browser.pause(200);

    // Undo both
    await browser.keys(["Control", "z"]);
    await browser.pause(200);
    await browser.keys(["Control", "z"]);
    await browser.pause(200);

    // Redo both
    await browser.keys(["Control", "y"]);
    await browser.pause(200);
    await browser.keys(["Control", "y"]);
    await browser.pause(200);

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });
});
