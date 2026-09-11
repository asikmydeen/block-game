import { test as base, expect, type Page } from '@playwright/test';

// Shared fixtures + flow helpers for the task 14.7 e2e suite.
//
// A note on realism: this is a heavy WebGL/R3F game. In headless chromium the
// GL context comes up via swiftshader, which is enough to mount the <Canvas>
// and run the app, but pointer-lock-driven 3D interactions (aiming a break/
// place ray, physics-driven movement) are not reliably reproducible. So the
// helpers here reach the app to the point where a specific behavior can be
// asserted at the COMMAND-DISPATCH boundary (a keybinding fires the right app
// command / state change) rather than by inspecting rendered pixels. Specs that
// take that route say so explicitly in their title/comments.

export interface ConsoleErrors {
  readonly messages: string[];
}

export const test = base.extend<{
  /** Collected console.error + pageerror text for the current page. */
  consoleErrors: ConsoleErrors;
}>({
  consoleErrors: async ({ page }, use) => {
    const messages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') messages.push(msg.text());
    });
    page.on('pageerror', (err) => messages.push(String(err)));
    await use({ messages });
  },
});

export { expect };

/**
 * Enable the test-only root-commit probe BEFORE any app script runs, so the
 * very first Game commit is counted. Must be called before `page.goto`.
 */
export async function enableCommitProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __BLOCKGAME_COMMIT_PROBE_ENABLED__?: boolean }).__BLOCKGAME_COMMIT_PROBE_ENABLED__ = true;
  });
}

/** A console-error that is background noise in headless chromium, not a bug. */
const IGNORABLE_CONSOLE = [
  /WebGL/i,
  /THREE\.WebGLRenderer/i,
  /Failed to load resource/i, // favicon / optional assets under headless
  /GPU stall/i,
  /Automatic fallback to software WebGL/i,
];

export function assertNoRealConsoleErrors(errors: ConsoleErrors): void {
  const real = errors.messages.filter((m) => !IGNORABLE_CONSOLE.some((re) => re.test(m)));
  expect(real, `unexpected console errors:\n${real.join('\n')}`).toEqual([]);
}

/**
 * Load the app and complete sign-in, landing on the mode-select menu.
 *
 * A returning browser resumes silently; a fresh context hits the LoginScreen,
 * where we submit a unique username (creating the account in the in-memory
 * backend). Returns the username used.
 */
export async function signInToMenu(page: Page, username?: string): Promise<string> {
  const name = username ?? `e2e_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 16);
  await page.goto('/');

  // Either the login card or (on resume) the menu appears.
  const usernameInput = page.locator('#bg-username');
  const menuHeading = page.getByText('CRAFTWORLD', { exact: false });
  await expect(menuHeading).toBeVisible();

  if (await usernameInput.isVisible().catch(() => false)) {
    await usernameInput.fill(name);
    await page.getByRole('button', { name: 'Play' }).click();
  }

  // Menu is reached when the Free Play mode card is present.
  await expect(page.getByText('Free Play', { exact: true })).toBeVisible();
  return name;
}

/** From the menu, enter Free Play and wait for the game canvas to mount. */
export async function enterFreePlay(page: Page): Promise<void> {
  // The Free Play card is a button whose accessible name includes its copy.
  await page.getByRole('button', { name: /Free Play/ }).click();
  await expect(page.getByTestId('game-root')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
}

/**
 * Dismiss the start overlay so gameplay input is live. The overlay is a
 * full-screen clickable div (not a button) containing "Click to play" /
 * "Tap to play"; clicking it sets `started`. On desktop it also requests
 * pointer lock, which headless cannot grant — but `started` is what the
 * command-dispatch assertions require.
 */
export async function startGame(page: Page): Promise<void> {
  const startText = page.getByText(/Click to play|Tap to play/).first();
  if (await startText.isVisible().catch(() => false)) {
    await startText.click({ force: true }).catch(() => {});
  }
}

/**
 * Return to the main menu from an in-game session. Opens the pause overlay
 * (Escape) and clicks "Back to menu", falling back to the start-overlay's own
 * "Back to menu" button when the game has not been started yet.
 */
export async function returnToMenu(page: Page): Promise<void> {
  const backBtn = page.getByRole('button', { name: /Back to menu/i }).first();
  if (!(await backBtn.isVisible().catch(() => false))) {
    await page.keyboard.press('Escape');
  }
  await expect(backBtn).toBeVisible();
  await backBtn.click();
  await expect(page.getByText('Free Play', { exact: true })).toBeVisible();
}

