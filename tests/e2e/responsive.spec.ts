import { test, expect, signInToMenu, enterFreePlay, startGame, assertNoRealConsoleErrors } from './fixtures';

// Task 14.7: desktop quality + responsive touch smoke.

test.describe('desktop quality', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('renders the canvas at a desktop viewport with a real backing store', async ({ page, consoleErrors }) => {
    await signInToMenu(page);
    await enterFreePlay(page);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const dims = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return { w: c.width, h: c.height };
    });
    // The R3F renderer created a real GL backing store.
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
    // The game root fills the desktop viewport (100vw/100vh container).
    const root = page.getByTestId('game-root');
    const box = await root.boundingBox();
    expect(box, 'game-root should have a layout box').not.toBeNull();
    expect(box!.width).toBeGreaterThan(800);
    expect(box!.height).toBeGreaterThan(500);
    assertNoRealConsoleErrors(consoleErrors);
  });
});

test.describe('responsive touch smoke', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // iPhone 13-ish
    hasTouch: true,
    isMobile: true,
  });

  test('mounts the game on a mobile touch viewport [command-level: touch UI]', async ({ page, consoleErrors }) => {
    await signInToMenu(page);
    await enterFreePlay(page);
    await expect(page.getByTestId('game-root')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    // On a touch device the game starts in third-person and shows a "Tap to
    // play" overlay; tapping it starts the session (touch controls then mount).
    await startGame(page);
    await expect(page.getByTestId('game-root')).toBeVisible();
    // The WebGL fallback must not be showing on mobile either.
    await expect(page.getByText('WebGL Not Available')).toHaveCount(0);
    assertNoRealConsoleErrors(consoleErrors);
  });
});
