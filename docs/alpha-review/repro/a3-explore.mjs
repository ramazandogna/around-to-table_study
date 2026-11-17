/* global console, process, document */
import { chromium, devices, BASE, shot, uniq } from './helpers.mjs';
const mode = process.argv[2] || 'desk';
const browser = await chromium.launch();
const phone = mode.startsWith('ph');
const vp = phone ? devices['iPhone 13'].viewport : { width: 1440, height: 900 };
const email = `a3${uniq()}@x.com`;
const context = await browser.newContext({
  ...(phone ? devices['iPhone 13'] : {}),
  viewport: vp,
  deviceScaleFactor: 1,
});
const page = await context.newPage();
if (mode === 'desk' || mode === 'ph') {
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(1500);
  await shot(page, `A3-${mode}-0-signin`);
  console.log('signin text:', (await page.locator('body').innerText()).slice(0, 400));
}
await page.goto(`${BASE}/api/auth/dev?email=${email}`);
await page.waitForTimeout(2000);
if (mode === 'desk' || mode === 'ph') {
  await shot(page, `A3-${mode}-1-lobby`);
  console.log('lobby:', (await page.locator('body').innerText()).slice(0, 400));
}
if (await page.locator('.lobby-new').count()) await page.locator('.lobby-new').first().click();
await page.waitForTimeout(1000);
if (mode === 'desk' || mode === 'ph') await shot(page, `A3-${mode}-2-create`);
console.log('create:', (await page.locator('body').innerText()).slice(0, 500));
await page.getByPlaceholder(/your name|adın|isim/i).fill('Ada' + uniq());
await page.getByRole('button', { name: /^(Enter|Gir)/ }).click();
await page.locator('canvas').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);
await shot(page, `A3-${mode}-3-intro`);
console.log('intro:', (await page.locator('body').innerText()).slice(0, 800));
await page
  .locator('.intro-ok')
  .click()
  .catch(() => {});
await page.waitForTimeout(1500);
await shot(page, `A3-${mode}-4-hall`);
console.log('hall:', (await page.locator('body').innerText()).slice(0, 800));
// small targets
const small = await page.evaluate(() =>
  [...document.querySelectorAll('button,a,[role=button],input')]
    .filter((e) => e.offsetParent)
    .map((e) => {
      const r = e.getBoundingClientRect();
      return {
        t: (e.getAttribute('aria-label') || e.innerText || e.className).slice(0, 25),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    })
    .filter((x) => x.w < 44 || x.h < 44),
);
console.log('small targets', JSON.stringify(small));
const unl = await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .filter((e) => e.offsetParent && !e.getAttribute('aria-label') && !e.innerText.trim())
    .map((e) => e.className),
);
console.log('unlabeled buttons', JSON.stringify(unl));
console.log(
  'html lang',
  await page.evaluate(() => document.documentElement.lang),
  'viewport meta',
  await page.evaluate(() => document.querySelector('meta[name=viewport]')?.content),
);
// keyboard
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Tab');
  console.log(
    'tab',
    await page.evaluate(() => {
      const a = document.activeElement;
      return (
        a.tagName + ':' + (a.getAttribute('aria-label') || a.innerText || a.className).slice(0, 30)
      );
    }),
  );
}
await context.storageState({ path: `/tmp/a3-${mode}.json` });
console.log('email', email);
await browser.close();
