// J09 (game half): first visit picks Turkish from ?lang=tr or a tr-* browser; a saved choice wins.
// Exits 0 when all four cases behave, 1 otherwise.
import { chromium, BASE } from './helpers.mjs';

const browser = await chromium.launch();
const lang = async (locale, url, before) => {
  const context = await browser.newContext({ locale });
  const page = await context.newPage();
  if (before) await page.addInitScript(before);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.lang);
  const result = await page.evaluate(() => document.documentElement.lang);
  await context.close();
  return result;
};
const cases = [
  ['browser tr-TR, no param', await lang('tr-TR', BASE + '/'), 'tr'],
  ['browser en-US, ?lang=tr', await lang('en-US', BASE + '/?lang=tr'), 'tr'],
  ['browser en-US, nothing', await lang('en-US', BASE + '/'), 'en'],
  [
    'saved en beats tr-TR and ?lang=tr',
    await lang('tr-TR', BASE + '/?lang=tr', () => localStorage.setItem('att.language', 'en')),
    'en',
  ],
];
let ok = true;
for (const [name, got, want] of cases) {
  console.log(`${got === want ? 'ok  ' : 'FAIL'} ${name}: ${got}`);
  ok &&= got === want;
}
await browser.close();
process.exit(ok ? 0 : 1);
