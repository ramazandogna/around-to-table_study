/* global console, process, document */
// T1-02: switching the language (a full page reload) in the middle of a Pomodoro drops the
// running focus block, the plan and the seat: the player is back in the Entrance Hall.
// A plain F5 does the same. Exits 1 while the bug exists, 0 when the block survives.
// Navigation clicks are by screen position (1280x800); exit 2 means the walk to a seat failed.
import { chromium, newPlayer, shot, uniq } from './helpers.mjs';

const browser = await chromium.launch();
const { page } = await newPlayer(browser, {
  email: `t1tim${uniq()}@example.com`,
  name: 'Tim' + uniq(),
});
const gotIt = async () => {
  const g = page.getByText('Got it');
  if (await g.isVisible().catch(() => false)) await g.click();
};
const hud = () => page.evaluate(() => document.body.innerText);
const timerShown = (text) => /(Round|Tur)\s*\d+\D+\d+\s*\n\s*\d{1,2}:\d\d/.test(text);
let code = 2;
try {
  await gotIt();
  // Hall -> library door -> library.
  await page.locator('.world-sign--door', { hasText: 'Library' }).dispatchEvent('click');
  await page.waitForTimeout(800);
  await page.mouse.click(1000, 200);
  await page.waitForTimeout(7000);
  await page.mouse.click(640, 260);
  await page.waitForTimeout(7000);
  await gotIt();
  // Sit at the desk to the right, pick "Just focusing", then a Pomodoro.
  await page.mouse.click(948, 333);
  await page.locator('[role=dialog] .choice').first().waitFor({ timeout: 10000 });
  await page.locator('[role=dialog] .choice').first().click();
  await page.locator('.study-ring-plan', { hasText: 'Pomodoro' }).click();
  await page.locator('[role=dialog] .panel-ok').click();
  await page.waitForTimeout(1000);
  const confirm = page.locator('[role=dialog] .panel-ok');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(1500);
  const before = await hud();
  if (!timerShown(before))
    throw new Error('could not start the Pomodoro (navigation by position failed)');
  console.log('before:', before.match(/Round[^\n]*\n[^\n]*/)?.[0].replace('\n', ' '));
  // Switch the language from the menu.
  await page.getByRole('button', { name: /Türkçe/ }).click();
  await page.waitForTimeout(9000);
  await gotIt();
  const after = await hud();
  await shot(page, 'T1-02-after-language');
  const kept = timerShown(after);
  const area =
    after.includes('Giriş Holü') || after.includes('Entrance Hall') ? 'Entrance Hall' : 'other';
  console.log(`after language switch: timer ${kept ? 'kept' : 'GONE'}, area ${area}`);
  code = kept ? 0 : 1;
} catch (e) {
  console.error(e.message);
}
await browser.close();
console.log(code === 1 ? 'FAIL: focus block lost' : code === 0 ? 'PASS' : 'INCONCLUSIVE');
process.exit(code);
