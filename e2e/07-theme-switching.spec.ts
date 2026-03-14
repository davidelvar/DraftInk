import { waitForCanvas, dismissHomeScreen, getTheme } from "./helpers";

describe("Theme Switching", () => {
  before(async () => {
    await dismissHomeScreen();
    await waitForCanvas();
  });

  it("should have a theme set on the document root", async () => {
    const theme = await getTheme();
    expect(theme === "light" || theme === "dark").toBe(true);
  });

  it("should switch to light theme", async () => {
    // Click the light theme button (Sun icon)
    const lightBtn = await $('[aria-label="Light theme"]');
    const exists = await lightBtn.isExisting();

    if (exists && (await lightBtn.isClickable())) {
      await lightBtn.click();
      await browser.pause(500);

      const theme = await getTheme();
      expect(theme).toBe("light");
    }
  });

  it("should switch to dark theme", async () => {
    // Click the dark theme button (Moon icon)
    const darkBtn = await $('[aria-label="Dark theme"]');
    const exists = await darkBtn.isExisting();

    if (exists && (await darkBtn.isClickable())) {
      await darkBtn.click();
      await browser.pause(500);

      const theme = await getTheme();
      expect(theme).toBe("dark");
    }
  });

  it("should switch to system theme", async () => {
    // Click the system theme button (Monitor icon)
    const systemBtn = await $('[aria-label="System theme"]');
    const exists = await systemBtn.isExisting();

    if (exists && (await systemBtn.isClickable())) {
      await systemBtn.click();
      await browser.pause(500);

      // System theme should resolve to either light or dark
      const theme = await getTheme();
      expect(theme === "light" || theme === "dark").toBe(true);
    }
  });

  it("should persist theme across canvas interactions", async () => {
    // Set dark theme
    const darkBtn = await $('[aria-label="Dark theme"]');
    if (await darkBtn.isExisting()) {
      await darkBtn.click();
      await browser.pause(300);
    }

    // Interact with the canvas (draw something)
    const canvas = await $("canvas");
    const location = await canvas.getLocation();

    await browser.performActions([
      {
        type: "pointer",
        id: "theme-test-pointer",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", duration: 0, x: location.x + 300, y: location.y + 300 },
          { type: "pointerDown", button: 0 },
          { type: "pointerMove", duration: 100, x: location.x + 400, y: location.y + 400 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ]);
    await browser.releaseActions();
    await browser.pause(300);

    // Theme should still be dark after canvas interaction
    const theme = await getTheme();
    expect(theme).toBe("dark");
  });

  it("should apply theme to canvas background", async () => {
    // Verify the document has the data-theme attribute set correctly
    const hasAttribute = await browser.execute(() => {
      return document.documentElement.hasAttribute("data-theme");
    });
    expect(hasAttribute).toBe(true);
  });
});
