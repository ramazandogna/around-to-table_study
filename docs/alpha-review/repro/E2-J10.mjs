/* global console, process, setTimeout */
// J10: the welcome shows once per account. First visit: the intro note, and no coach card after it.
// Same account on a fresh browser: no intro, no coach, one "Welcome back" line.
// Exits 0 when all of that holds, 1 otherwise.
import { chromium, BASE, newPlayer, uniq } from './helpers.mjs';

const browser = await chromium.launch();
const email = `e2j10${uniq()}@example.com`;
const name = 'Wel' + uniq();
const results = [];
const check = (label, ok) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};

// First visit: newPlayer dismisses the intro note, then nothing else should pop up.
const first = await newPlayer(browser, { email, name });
await first.page.waitForTimeout(1500);
check(
  'first visit: no coach card after the intro note',
  (await first.page.locator('.coach').count()) === 0,
);
// Let the progress reach the server (it is sent when the page goes away).
await first.page.goto('about:blank');
await new Promise((r) => setTimeout(r, 1500));
await first.context.close();

// Same account, a browser that has never seen the game.
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await page.goto(`${BASE}/api/auth/dev?email=${encodeURIComponent(email)}`);
await page.getByRole('button', { name: 'Play as them' }).first().click();
const notice = page.locator('.notice');
await notice.waitFor({ timeout: 30000 }).catch(() => {});
const text = (await notice.innerText().catch(() => '')) || '';
console.log('notice:', JSON.stringify(text));
check('returning: one welcome-back line', /^Welcome back/.test(text));
check('returning: no intro note', (await page.locator('.intro-note').count()) === 0);
check('returning: no coach card', (await page.locator('.coach').count()) === 0);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
