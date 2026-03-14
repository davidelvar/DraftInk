/**
 * Shared helpers for E2E tests.
 */

/** Wait for the app's webview to load and the canvas to be visible. */
export async function waitForCanvas(): Promise<void> {
  const canvas = await $("canvas");
  await canvas.waitForExist({ timeout: 15000 });
  await canvas.waitForDisplayed({ timeout: 10000 });
}

/** Click a button by its aria-label attribute. */
export async function clickByLabel(label: string): Promise<void> {
  const btn = await $(`[aria-label="${label}"]`);
  await btn.waitForClickable({ timeout: 5000 });
  await btn.click();
}

/** Check if a button with the given aria-label exists and is displayed. */
export async function isButtonVisible(label: string): Promise<boolean> {
  const btn = await $(`[aria-label="${label}"]`);
  return btn.isDisplayed();
}

/** Get the current data-theme attribute on the root element. */
export async function getTheme(): Promise<string | null> {
  return browser.execute(() => document.documentElement.getAttribute("data-theme"));
}

/** Dismiss the home screen by clicking "New Board" or the first available board. */
export async function dismissHomeScreen(): Promise<void> {
  // The HomeScreen has a "New Blank Board" button or similar entry point
  // Try clicking a "New Blank Board" button first
  const newBoardBtn = await $("button*=New Blank Board");
  const exists = await newBoardBtn.isExisting();

  if (exists) {
    await newBoardBtn.click();
  } else {
    // Fallback: try any clickable element that enters the board view
    const enterBtn = await $("button*=New");
    if (await enterBtn.isExisting()) {
      await enterBtn.click();
    }
  }

  // Wait for canvas to appear after entering board view
  await waitForCanvas();
}

/** Simulate drawing a stroke on the canvas by performing mouse actions. */
export async function drawStroke(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps = 5
): Promise<void> {
  const canvas = await $("canvas");
  const location = await canvas.getLocation();
  const size = await canvas.getSize();

  // Ensure coordinates are within canvas bounds
  const absStartX = location.x + Math.min(startX, size.width - 10);
  const absStartY = location.y + Math.min(startY, size.height - 10);
  const absEndX = location.x + Math.min(endX, size.width - 10);
  const absEndY = location.y + Math.min(endY, size.height - 10);

  // Perform the stroke using pointer actions
  await browser.performActions([
    {
      type: "pointer",
      id: "draw-pointer",
      parameters: { pointerType: "mouse" },
      actions: [
        { type: "pointerMove", duration: 0, x: Math.round(absStartX), y: Math.round(absStartY) },
        { type: "pointerDown", button: 0 },
        // Intermediate points for a realistic stroke
        ...Array.from({ length: steps }, (_, i) => ({
          type: "pointerMove" as const,
          duration: 50,
          x: Math.round(absStartX + ((absEndX - absStartX) * (i + 1)) / steps),
          y: Math.round(absStartY + ((absEndY - absStartY) * (i + 1)) / steps),
        })),
        { type: "pointerUp", button: 0 },
      ],
    },
  ]);

  await browser.releaseActions();
}
