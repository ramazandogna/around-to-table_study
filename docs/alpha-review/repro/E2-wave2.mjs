// Wave 2 client checks (1440x900, scale 1):
//  J02 a full room says "full" in the reception (shot E2-full.png)
//  J07 a player card has Report; the dialog sends a report; an admin sees it (shot E2-report.png)
//  J08 "Delete account" asks for the typed word, erases the account and returns to sign-in (shot E2-delete.png)
// Needs ADMIN_EMAILS=e2admin@example.com in apps/server/.dev.vars for the admin part.
// Exits 0 when everything holds, 1 otherwise.
import { chromium, BASE, newPlayer, shot, uniq } from './helpers.mjs';

const VIEW = { width: 1440, height: 900 };
const browser = await chromium.launch();
const results = [];
const check = (label, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` (${extra})` : ''}`);
};

/* ---------- J02: a full room ---------- */
const sockets = [];
let roomCode = '';
for (let i = 0; i < 3; i++) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/api/auth/dev?email=e2full${i}${uniq()}@example.com`);
  const code = await page.evaluate(
    async ({ name, code }) => {
      const post = (url, body) =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => r.json());
      const made = await post('/api/characters', { name, look: { character: 0 } });
      const { token } = await post('/api/play', { id: made.id });
      let room = code;
      if (!room) room = (await post('/api/rooms', { token, name: 'Tiny', size: 3 })).room.code;
      const { pass } = await post(`/api/rooms/${room}/enter`, { token });
      const ws = new WebSocket(
        `${location.origin.replace('http', 'ws')}/api/areas/room3/ws?token=${encodeURIComponent(token)}&room=${room}&pass=${encodeURIComponent(pass)}`,
      );
      await new Promise((res) => (ws.onopen = res));
      ws.send(JSON.stringify({ t: 'hello', look: { character: 0 } }));
      return room;
    },
    { name: `Fu${i}${uniq()}`, code: roomCode },
  );
  roomCode = code;
  sockets.push(context);
}
await new Promise((r) => setTimeout(r, 1500));
const joiner = await newPlayer(browser, {
  email: `e2join${uniq()}@example.com`,
  name: 'Jo' + uniq(),
  viewport: VIEW,
});
await joiner.page.goto(`${BASE}/?room=${roomCode}`);
await joiner.page.locator('.panel--rooms').waitFor({ timeout: 30000 });
await joiner.page.locator('.panel--rooms button[type=submit]').click();
const full = joiner.page.locator('.panel-error');
await full.waitFor({ timeout: 15000 }).catch(() => {});
check('joining a full room says so', /full/i.test((await full.innerText().catch(() => '')) || ''));
await shot(joiner.page, 'E2-full');
await joiner.page.context().close();
for (const context of sockets) await context.close();

/* ---------- J07: report, and the admin view ---------- */
const reporter = await newPlayer(browser, {
  email: `e2admin@example.com`,
  name: 'Ada' + uniq(),
  viewport: VIEW,
});
const targetName = 'Tom' + uniq();
const target = await newPlayer(browser, {
  email: `e2target${uniq()}@example.com`,
  name: targetName,
  viewport: VIEW,
});
await reporter.page.waitForTimeout(2500);
await reporter.page.locator('.avatar-name', { hasText: targetName }).first().click({ force: true });
const report = reporter.page.locator('.player-card .mini-button', { hasText: 'Report' });
await reporter.page.getByText('Profile', { exact: true }).click();
await report.waitFor({ timeout: 15000 }).catch(() => {});
check('the player card has a Report button', (await report.count()) === 1);
await report.click();
await reporter.page.locator('.report-panel').waitFor({ timeout: 10000 });
await reporter.page.locator('.report-panel [role=radio]').nth(1).click();
await reporter.page.locator('#report-note').fill('Posting ads in the hall');
await shot(reporter.page, 'E2-report');
await reporter.page.locator('.report-panel button[type=submit]').click();
await reporter.page
  .locator('.notice', { hasText: /report sent/i })
  .waitFor({ timeout: 10000 })
  .catch(() => {});
check('the report is acknowledged', (await reporter.page.locator('.notice').count()) === 1);
// The admin (the reporter's email is in ADMIN_EMAILS) reads it in the Admins panel.
await reporter.page.locator('.hud-link', { hasText: /Bell/ }).first().click();
await reporter.page.locator('.inbox-panel .mini-button', { hasText: /Admins/ }).click();
const item = reporter.page.locator('.report-item', { hasText: targetName });
await item.waitFor({ timeout: 10000 }).catch(() => {});
check('an admin sees the report', (await item.count()) === 1);
await reporter.page.context().close();
await target.page.context().close();

/* ---------- J08: delete the account ---------- */
const email = `e2del${uniq()}@example.com`;
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.goto(`${BASE}/api/auth/dev?email=${encodeURIComponent(email)}`);
await page.evaluate(async (name) => {
  await fetch('/api/characters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, look: { character: 0 } }),
  });
}, 'De' + uniq());
await page.reload();
await page.getByRole('button', { name: 'Delete account' }).click();
const confirm = page.locator('.panel--dialog button[type=submit]');
check('delete is disabled until the word is typed', await confirm.isDisabled());
await page.locator('#delete-word').fill('delete');
await shot(page, 'E2-delete');
check('typing DELETE enables it', await confirm.isEnabled());
await confirm.click();
await page.waitForFunction(() => document.querySelector('.lobby-panel') === null, null, {
  timeout: 20000,
});
await page.waitForTimeout(1500);
const me = await page.evaluate(() => fetch('/api/me').then((r) => r.json()));
check('the account is gone and the page is signed out', !me.account);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
