// J12: Friends, Phone, Goals (and the Calendar) behave like dialogs: the first control takes focus, Tab
// stays inside, Escape closes, and focus goes back to the button that opened them.
// Exit 0 when all of that holds for each panel, 1 otherwise.
import { chromium, newPlayer, uniq } from './helpers.mjs';

const browser = await chromium.launch();
const { page } = await newPlayer(browser, {
  email: `e2j12${uniq()}@example.com`,
  name: 'Dia' + uniq(),
});
const results = [];
const check = (label, ok) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
const insideAndCount = (selector) =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel);
    return {
      inside: !!root && root.contains(document.activeElement),
      tag: document.activeElement?.tagName,
    };
  }, selector);

const panels = [
  { name: /^\S*\s*Friends$/, root: '.friends-panel' },
  { name: /^\S*\s*Phone$/, root: '.phone-panel' },
  { name: /^\S*\s*Goals$/, root: '[role=dialog]' },
];
for (const { name, root } of panels) {
  const opener = page.locator('.hud-link', { hasText: name }).first();
  await opener.click();
  await page.waitForTimeout(500);
  const first = await insideAndCount(root);
  check(`${root}: focus lands inside on open`, first.inside);
  let stays = true;
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    stays &&= (await insideAndCount(root)).inside;
  }
  check(`${root}: 14 Tab presses stay inside`, stays);
  let staysBack = true;
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    staysBack &&= (await insideAndCount(root)).inside;
  }
  check(`${root}: Shift+Tab stays inside`, staysBack);
  // Escape from a button (a text field keeps its own Escape).
  await page.evaluate((sel) => document.querySelector(sel)?.querySelector('button')?.focus(), root);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(`${root}: Escape closes it`, (await page.locator(root).count()) === 0);
  const back = await page.evaluate(
    () => document.activeElement?.closest('.hud-link')?.textContent ?? '',
  );
  check(`${root}: focus returns to the button that opened it`, name.test(back.trim()));
}
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
