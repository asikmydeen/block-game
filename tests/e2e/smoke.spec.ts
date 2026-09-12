import { test, expect, signInToMenu, enterFreePlay, startGame, returnToMenu, assertNoRealConsoleErrors } from './fixtures';

// Priority 1 (task 14.7): app bring-up against the production build served by
// the app's own express server with an ephemeral in-memory backend.

test.describe('smoke: bring-up and account flow', () => {
  test('creates an account and reaches the mode-select menu', async ({ page, consoleErrors }) => {
    const name = await signInToMenu(page);
    await expect(page.getByText(new RegExp(`Signed in as`))).toBeVisible();
    await expect(page.getByText(name, { exact: false })).toBeVisible();
    // All three modes are offered.
    await expect(page.getByText('Free Play', { exact: true })).toBeVisible();
    await expect(page.getByText('Levels', { exact: true })).toBeVisible();
    await expect(page.getByText('Multiplayer', { exact: true })).toBeVisible();
    assertNoRealConsoleErrors(consoleErrors);
  });

  test('enters Free Play, mounts the canvas, no console errors', async ({ page, consoleErrors }) => {
    await signInToMenu(page);
    await enterFreePlay(page);
    // The R3F canvas is present and has a real drawing surface.
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const size = await canvas.evaluate((el) => ({
      w: (el as HTMLCanvasElement).width,
      h: (el as HTMLCanvasElement).height,
    }));
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);
    // The WebGL-unavailable fallback must NOT be showing.
    await expect(page.getByText('WebGL Not Available')).toHaveCount(0);
    assertNoRealConsoleErrors(consoleErrors);
  });

  test('starts the game and returns to the menu', async ({ page }) => {
    await signInToMenu(page);
    await enterFreePlay(page);
    await startGame(page);
    await returnToMenu(page);
    await expect(page.getByText('Free Play', { exact: true })).toBeVisible();
  });

  test('resumes the same account silently on reload (device memory)', async ({ page }) => {
    const name = await signInToMenu(page);
    // Reload: the stored device id + token should resume without a login prompt.
    await page.reload();
    await expect(page.getByText('Free Play', { exact: true })).toBeVisible();
    await expect(page.locator('#bg-username')).toHaveCount(0);
    await expect(page.getByText(name, { exact: false })).toBeVisible();
  });

  test('switch user returns to the login screen', async ({ page }) => {
    await signInToMenu(page);
    await page.getByRole('button', { name: 'switch user' }).click();
    await expect(page.locator('#bg-username')).toBeVisible();
    // Sign in as a different account.
    const other = `e2e_sw_${Math.floor(Math.random() * 1e5)}`.slice(0, 16);
    await page.locator('#bg-username').fill(other);
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByText(other, { exact: false })).toBeVisible();
  });
});
