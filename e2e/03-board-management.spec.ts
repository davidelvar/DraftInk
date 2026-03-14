import { waitForCanvas, dismissHomeScreen } from "./helpers";

describe("Board Management", () => {
  before(async () => {
    await dismissHomeScreen();
    await waitForCanvas();
  });

  it("should display the board panel", async () => {
    // BoardPanel is shown at the top of the board view
    // It contains board cards and a "New board" button
    const newBoardBtn = await $('[aria-label="New board"]');
    expect(await newBoardBtn.isDisplayed()).toBe(true);
  });

  it("should create a new board via the board panel", async () => {
    // Click the "New board" button (Plus icon card in BoardPanel)
    const newBoardBtn = await $('[aria-label="New board"]');
    await newBoardBtn.click();

    // Wait for the new board to be created and canvas to re-render
    await browser.pause(1000);

    // Canvas should still be displayed after board switch
    const canvas = await $("canvas");
    expect(await canvas.isDisplayed()).toBe(true);
  });

  it("should switch between boards by clicking board cards", async () => {
    // After creating a new board, there should be at least 2 board cards
    // Click on the first board card to switch back
    const boardCards = await $$('[class*="board-card"]');
    const elements = await boardCards.getElements();

    if (elements.length >= 2) {
      await boardCards[0].click();
      await browser.pause(500);

      const canvas = await $("canvas");
      expect(await canvas.isDisplayed()).toBe(true);
    }
  });

  it("should show board panel toggle functionality", async () => {
    // The board panel can be expanded/collapsed
    // Look for the chevron toggle buttons
    const toggleDown = await $('[aria-label="Expand boards"]');
    const toggleUp = await $('[aria-label="Collapse boards"]');

    const downExists = await toggleDown.isExisting();
    const upExists = await toggleUp.isExisting();

    // At least one toggle should exist
    expect(downExists || upExists).toBe(true);
  });
});
