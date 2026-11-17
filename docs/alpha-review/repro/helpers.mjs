/* global console, process */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
export const { chromium, devices } = require('playwright');

export const BASE = process.env.ATT_URL ?? 'http://localhost:8787';
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../shots');

/**
 * Sign in with the local test email, create (or reuse) a character, enter the game.
 * Returns {page, context}; the page stands in the entrance hall with the intro note dismissed.
 */
/** Returns a random letters-only suffix, handy for unique names/emails (names must be unique). */
export const uniq = () =>
  Array.from(
    { length: 4 },
    () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)],
  ).join('');

export async function newPlayer(
  browser,
  { email, name, viewport = { width: 1280, height: 800 }, contextOptions = {} } = {},
) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...contextOptions });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`[${name}] pageerror:`, e.message));
  // Local-only sign-in: sets the session cookie and redirects to /.
  await page.goto(`${BASE}/api/auth/dev?email=${encodeURIComponent(email)}`);
  await page.waitForLoadState('domcontentloaded');
  const enter = page.getByRole('button', { name: 'Enter', exact: true });
  const play = page.getByRole('button', { name: 'Play as them' }).first();
  const newCard = page.locator('.lobby-new').first();
  await enter.or(play).or(newCard).first().waitFor({ timeout: 30000 });
  if (!(await enter.isVisible())) {
    if (await play.isVisible()) await play.click();
    else await newCard.click();
  }
  if (
    (await enter.isVisible().catch(() => false)) ||
    (await enter.waitFor({ timeout: 3000 }).then(
      () => true,
      () => false,
    ))
  ) {
    await page.getByPlaceholder('your name').fill(name);
    await enter.click();
  }
  const taken = page.locator('.panel-error');
  await page.locator('canvas').first().or(taken).first().waitFor({ timeout: 30000 });
  if (await taken.isVisible().catch(() => false)) {
    throw new Error(
      `newPlayer(${name}): ${await taken.innerText()} (names are unique per local DB; use a fresh name)`,
    );
  }
  // Dismiss the first-visit intro note if it shows.
  const ok = page.locator('.intro-ok');
  if (
    await ok.waitFor({ timeout: 6000 }).then(
      () => true,
      () => false,
    )
  )
    await ok.click();
  await page.waitForTimeout(1500);
  return { page, context };
}

/** Screenshot to docs/alpha-review/shots/<name>.png (viewport only, scale 1). */
export async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}
