// J13: phone panels stop colliding (390px, iPhone 13 touch). Checks:
//  - the room-chat toggle hides while a panel is open
//  - the menu plate folds when a panel (Calendar) opens
//  - the chat input is at least 160px wide with a short placeholder
//  - the coach card is one line and does not touch the joystick (English and Turkish)
// Saves 4 screenshots to docs/alpha-review/shots/E2-j13-*.png. Exit 0 when all hold, 1 otherwise.
import { chromium, devices, BASE, newPlayer, shot, uniq } from './helpers.mjs';

const phone = devices['iPhone 13'];
const browser = await chromium.launch();
const { page } = await newPlayer(browser, {
  email: `e2j13${uniq()}@example.com`,
  name: 'Fon' + uniq(),
  viewport: phone.viewport,
  contextOptions: { ...phone, deviceScaleFactor: 1 },
});
const results = [];
const check = (label, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` (${extra})` : ''}`);
};
const box = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const shown = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    return shown ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  }, selector);
const overlap = (a, b) =>
  !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 1. The chat line.
const input = await box('.chat-bar input');
const placeholder = await page.locator('.chat-bar input').getAttribute('placeholder');
check(
  'chat input is at least 160px wide',
  !!input && input.w >= 160,
  `${Math.round(input?.w ?? 0)}px`,
);
check('placeholder is short', (placeholder ?? '').length <= 12, JSON.stringify(placeholder));
await shot(page, 'E2-j13-chat');

// 2. Menu open, then a panel: the menu folds and the chat toggle is gone.
await page.locator('.hud-fold').click();
await page.waitForTimeout(400);
check('menu is open before the panel', (await page.locator('.hud-title--folded').count()) === 0);
await page.locator('.world-clock').first().click();
await page.waitForTimeout(800);
check(
  'menu closes when the calendar opens',
  (await page.locator('.hud-title--folded').count()) === 1,
);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('.hud-fold').click();
await page
  .locator('.hud-link', { hasText: /Friends/ })
  .first()
  .click();
await page.waitForTimeout(800);
check('friends panel is open', (await page.locator('.friends-panel').count()) === 1);
check('chat toggle is hidden while a panel is open', (await box('.chat-toggle')) === null);
check('menu is folded behind the panel', (await page.locator('.hud-title--folded').count()) === 1);
await shot(page, 'E2-j13-panel');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('chat toggle is back when the panel closes', (await box('.chat-toggle')) !== null);

// 3. The hall coach, in English and in Turkish.
for (const lang of ['en', 'tr']) {
  await page.evaluate((l) => {
    localStorage.setItem('att.language', l);
    localStorage.removeItem('att.coach');
    localStorage.setItem('att.intro', 'true');
  }, lang);
  await page.reload();
  await page.locator('.coach').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  const coach = await box('.coach');
  const text = await box('.coach p');
  const stick = await box('.joystick');
  check(
    `coach (${lang}) is one line`,
    !!text && text.h <= 24,
    `text ${Math.round(text?.h ?? 0)}px high`,
  );
  check(`coach (${lang}) stays off the joystick`, !!coach && !!stick && !overlap(coach, stick));
  const button = await box('.coach .mini-button');
  check(`coach (${lang}) button is at least 44px`, !!button && button.w >= 44 && button.h >= 44);
  if (lang === 'en') await shot(page, 'E2-j13-coach-en');
  else await shot(page, 'E2-j13-coach-tr');
}
await browser.close();
console.log(BASE);
process.exit(results.every(Boolean) ? 0 : 1);
