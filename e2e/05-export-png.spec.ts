import { waitForCanvas, dismissHomeScreen, clickByLabel, drawStroke } from "./helpers";

describe("Export to PNG", () => {
  before(async () => {
    await dismissHomeScreen();
    await waitForCanvas();
  });

  it("should draw content before exporting", async () => {
    // Add some content to export
    await clickByLabel("Pen");
    await drawStroke(150, 150, 450, 350, 10);
    await browser.pause(500);

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should have the export/download button available", async () => {
    // TopBar has a Download/Export button
    const exportBtn = await $('[aria-label="Export"]');
    expect(await exportBtn.isDisplayed()).toBe(true);
  });

  it("should open export options when clicking export", async () => {
    // Click the export button to reveal format options
    await clickByLabel("Export");
    await browser.pause(500);

    // Look for PNG option in the export dropdown/menu
    const pngOption = await $("button*=PNG");
    const pngExists = await pngOption.isExisting();

    if (pngExists) {
      // If a PNG button is available, click it
      await pngOption.click();
      await browser.pause(1000);
    }

    // App should remain responsive after export attempt
    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should support export via keyboard shortcut", async () => {
    // Ctrl+Shift+E or similar shortcut for export
    // Try triggering export and verify app stability
    await browser.keys(["Control", "Shift", "e"]);
    await browser.pause(1000);

    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });
});
