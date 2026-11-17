import { chromium, devices, BASE, shot, uniq } from './helpers.mjs';
const phone = process.argv[2] === 'ph';
const browser = await chromium.launch();
const vp = phone ? devices['iPhone 13'].viewport : { width: 1440, height: 900 };
const context = await browser.newContext({
  ...(phone ? devices['iPhone 13'] : {}),
  viewport: vp,
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.goto(`${BASE}/api/auth/dev?email=a3${uniq()}@x.com`);
await page.waitForTimeout(1500);
const enter = page.getByRole('button', { name: /^(Enter|Gir)/ });
console.log(
  'enter visible in viewport?',
  await enter.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return r.bottom <= innerHeight + 1 && r.top >= 0;
  }),
  'scrollH',
  await page.evaluate(() => document.documentElement.scrollHeight + '/' + innerHeight),
);
await page.getByPlaceholder('your name').fill('Bo' + uniq());
await enter.click();
await page.locator('canvas').first().waitFor();
await page
  .locator('.intro-ok')
  .click({ timeout: 10000 })
  .catch(() => {});
await page
  .getByText('Got it')
  .click({ timeout: 2000 })
  .catch(() => {});
// switch to Turkish
if (phone) {
  await page.getByLabel('Open the menu').click();
  await page.waitForTimeout(500);
  await shot(page, 'A3-ph-5-menu');
}
await page.getByText('Türkçe').click();
await page
  .locator('.intro-ok')
  .click({ timeout: 10000 })
  .catch(() => {});
await page
  .getByRole('button', { name: /Tamam|Anladım/ })
  .click({ timeout: 1500 })
  .catch(() => {});
await page.waitForTimeout(800);
console.log('TR body:', (await page.locator('body').innerText()).slice(0, 500));
if (phone) {
  await page
    .locator('button[aria-label]')
    .first()
    .click()
    .catch(() => {});
}
await shot(page, `A3-${phone ? 'ph' : 'desk'}-6-tr`);
// overflow detection
const over = await page.evaluate(() =>
  [...document.querySelectorAll('button,.hud *,.panel *')]
    .filter(
      (e) =>
        e.offsetParent &&
        e.scrollWidth > e.clientWidth + 1 &&
        getComputedStyle(e).overflow !== 'visible',
    )
    .map((e) => (e.className + ':' + e.innerText).slice(0, 50))
    .slice(0, 15),
);
console.log('overflow', JSON.stringify(over));
// open each panel and test Esc
for (const name of [/Takvim|calendar|📅/i, /Arkadaş|Friends/, /Telefon|Phone/]) {
  const b = page.locator('button', { hasText: name }).first();
  if (!(await b.count())) {
    console.log('no btn', name);
    continue;
  }
  if (!(await b.isVisible())) {
    console.log('hidden btn', name);
    continue;
  }
  await b.click();
  await page.waitForTimeout(700);
  const dlg = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog],.panel--dialog,.panel');
    return d
      ? {
          role: d.getAttribute('role'),
          modal: d.getAttribute('aria-modal'),
          label: d.getAttribute('aria-label'),
          focus:
            document.activeElement.tagName +
            ':' +
            (document.activeElement.innerText || '').slice(0, 20),
        }
      : null;
  });
  console.log(
    String(name),
    JSON.stringify(dlg),
    (await page.locator('body').innerText()).slice(-300).replace(/\n/g, ' | '),
  );
  await shot(page, `A3-${phone ? 'ph' : 'desk'}-7-${String(name).slice(1, 5)}`).catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  console.log(' after esc panels', await page.locator('.panel--dialog').count());
}
await browser.close();
