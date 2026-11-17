/* global console, process, document */
// J03: a running block survives a language switch and F5; the player is told to sit down again.
// Same walk as T1-02 but it waits for each room instead of sleeping. Exit 0 = fixed, 1 = bug, 2 = inconclusive.
import { chromium, newPlayer, uniq } from './helpers.mjs';

const browser = await chromium.launch();
const { page } = await newPlayer(browser, {
  email: `e2j03${uniq()}@example.com`,
  name: 'Jay' + uniq(),
});
const gotIt = async () => {
  const g = page.getByText('Got it');
  if (await g.isVisible().catch(() => false)) await g.click();
};
const hud = () => page.evaluate(() => document.body.innerText);
const timerShown = (text) => /(Round|Tur)\s*\d+\D+\d+\s*\n\s*\d{1,2}:\d\d/.test(text);
const inArea = async (name, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (
      (
        await page
          .locator('.hud-area')
          .innerText()
          .catch(() => '')
      ).includes(name)
    )
      return true;
    await page.waitForTimeout(500);
  }
  return false;
};
let code = 2;
try {
  await gotIt();
  await page.locator('.world-sign--door', { hasText: 'Library' }).dispatchEvent('click');
  await page.waitForTimeout(800);
  await page.mouse.click(1000, 200);
  // The walk is slow in a software-rendered browser: wait until the camera shows the glass door
  // right above the player (the sign settles at about 690,255), then tap the doorway.
  const sign = page.locator('.world-sign--door', { hasText: 'Library' });
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const box = await sign.boundingBox().catch(() => null);
    if (box && Math.abs(box.x + box.width / 2 - 690) < 30 && Math.abs(box.y - 242) < 30) break;
  }
  await page.waitForTimeout(1000);
  await page.mouse.click(690, 320);
  if (!(await inArea('Library'))) throw new Error('did not reach the library');
  await page.waitForTimeout(1500);
  await gotIt();
  await page.waitForTimeout(9000);
  await gotIt();
  await page.mouse.click(968, 305); // a visitor chair at the first desk on the right
  await page.locator('[role=dialog] .choice').first().waitFor({ timeout: 40000 });
  await page.locator('[role=dialog] .choice').first().click();
  await page.locator('.study-ring-plan', { hasText: 'Pomodoro' }).click();
  await page.locator('[role=dialog] .panel-ok').click();
  await page.waitForTimeout(1000);
  const confirm = page.locator('[role=dialog] .panel-ok');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(1500);
  if (!timerShown(await hud())) throw new Error('could not start the Pomodoro');

  const check = async (label) => {
    await page.waitForSelector('.timer-hud', { timeout: 30000 }).catch(() => {});
    await gotIt();
    const text = await hud();
    const kept = timerShown(text);
    const told = /sit down again|tekrar otur/i.test(text);
    console.log(`${label}: timer ${kept ? 'kept' : 'GONE'}, told to sit ${told ? 'yes' : 'NO'}`);
    return kept && told;
  };
  await page.getByRole('button', { name: /Türkçe/ }).click();
  await page.waitForLoadState('load');
  const afterLanguage = await check('after language switch');
  await page.reload();
  const afterReload = await check('after F5');
  code = afterLanguage && afterReload ? 0 : 1;
} catch (e) {
  console.error(e.message);
}
await browser.close();
console.log(code === 1 ? 'FAIL: focus block lost' : code === 0 ? 'PASS' : 'INCONCLUSIVE');
process.exit(code);
