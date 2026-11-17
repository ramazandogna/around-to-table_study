/* global console, process, document, globalThis */
// T1-09 evidence: a device clock ahead of the server shows the Thursday meetup "now" and other daily quests.
import { chromium, uniq, BASE } from './helpers.mjs';
const target = Date.UTC(2026, 10, 19, 12, 30);
const off = target - Date.now();
const browser = await chromium.launch();
async function skewed(offset, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((o) => { const R = Date; globalThis.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(R.now() + o); } static now() { return R.now() + o; } }; }, offset);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(tag, 'pageerror', e.message));
  await page.goto(`${BASE}/api/auth/dev?email=sk${uniq()}@t1.test`);
  const enter = page.getByRole('button', { name: 'Enter', exact: true });
  await enter.or(page.locator('.lobby-new')).first().waitFor({ timeout: 30000 }).catch(async () => { console.log(tag, 'STUCK:', (await page.evaluate(() => document.body.innerText)).slice(0, 300)); });
  if (!(await enter.isVisible())) await page.locator('.lobby-new').first().click();
  await page.getByPlaceholder('your name').fill('Skew' + uniq());
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await page.locator('canvas').first().waitFor();
  const ok = page.locator('.intro-ok'); if (await ok.waitFor({ timeout: 6000 }).then(() => true, () => false)) await ok.click();
  await page.waitForTimeout(2500);
  return page;
}
const S = await skewed(off, 'skew+');
const N = await skewed(0, 'normal');
const M = await skewed(-400 * 24 * 3600e3, 'skew-400d');
for (const [t, p] of [['skew+', S], ['normal', N], ['skew-400d', M]]) {
  const txt = await p.locator('.world-clock').innerText().catch(() => '?');
  console.log(t, JSON.stringify(txt), '| quests:', (await p.locator('.quests-head').innerText().catch(()=>'')).replace(/\n/g,' '), (await p.evaluate(() => document.body.innerText)).match(/[^\n]*(Dance a little|Look in|Take a break|Study|Say|Pet)[^\n]*/g)?.slice(0,3).join(' / '));
}
await browser.close();
