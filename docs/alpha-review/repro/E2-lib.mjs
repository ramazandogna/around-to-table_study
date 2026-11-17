/* global document */
// Shared steps for the E2 browser checks (1280x800, software-rendered, so every walk is waited for).
export const gotIt = async (page) => {
  const g = page.getByText('Got it');
  if (await g.isVisible().catch(() => false)) await g.click();
};

export const hudText = (page) => page.evaluate(() => document.body.innerText);

export async function inArea(page, name, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const text = await page
      .locator('.hud-area')
      .innerText()
      .catch(() => '');
    if (text.includes(name)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/** From the Entrance Hall spawn: through the glass doors into the library, settled and ready. */
export async function reachLibrary(page) {
  await gotIt(page);
  await page.locator('.world-sign--door', { hasText: 'Library' }).dispatchEvent('click');
  await page.waitForTimeout(800);
  await page.mouse.click(1000, 200);
  // Wait until the camera shows the glass door right above the player, then tap the doorway.
  const sign = page.locator('.world-sign--door', { hasText: 'Library' });
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const box = await sign.boundingBox().catch(() => null);
    if (box && Math.abs(box.x + box.width / 2 - 690) < 30 && Math.abs(box.y - 242) < 30) break;
  }
  await page.waitForTimeout(1000);
  await page.mouse.click(690, 320);
  if (!(await inArea(page, 'Library'))) throw new Error('did not reach the library');
  await page.waitForTimeout(10000);
  await gotIt(page);
}

/** Taps the visitor chair at the first desk on the right (valid right after reachLibrary). */
export async function tapChair(page) {
  await page.mouse.click(968, 305);
}

/** Sits down, picks "just focusing" and a Pomodoro (confirming the dialogs). */
export async function sitAndStartPomodoro(page) {
  await tapChair(page);
  await page.locator('[role=dialog] .choice').first().waitFor({ timeout: 40000 });
  await page.locator('[role=dialog] .choice').first().click();
  await page.locator('.study-ring-plan', { hasText: 'Pomodoro' }).click();
  await page.locator('[role=dialog] .panel-ok').click();
  await page.waitForTimeout(1000);
  const confirm = page.locator('[role=dialog] .panel-ok');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(1500);
}

/** Moves the page's clock forward by `ms` (the timers read Date.now()). */
export async function skipTime(page, ms) {
  await page.evaluate((ms) => {
    const Real = globalThis.__RealDate ?? Date;
    globalThis.__RealDate = Real;
    globalThis.__skip = (globalThis.__skip ?? 0) + ms;
    globalThis.Date = class extends Real {
      constructor(...a) {
        if (a.length) super(...a);
        else super(Real.now() + globalThis.__skip);
      }
      static now() {
        return Real.now() + globalThis.__skip;
      }
    };
  }, ms);
}
