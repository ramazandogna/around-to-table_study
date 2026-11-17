/* global console, process */
// J11: after a break, "Let's go" walks the player back to their last chair and the next block starts
// when they sit. If another person took the chair, the player waits at the library door with a note.
// Exit 0 = fixed, 1 = bug, 2 = inconclusive. The clock is moved forward in the page to skip the minutes.
import { chromium, newPlayer, shot, uniq } from './helpers.mjs';
import {
  reachLibrary,
  sitAndStartPomodoro,
  skipTime,
  tapChair,
  gotIt,
  hudText,
} from './E2-lib.mjs';

const browser = await chromium.launch();
const results = [];
const check = (label, ok) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
const waitFor = async (page, fn, ms = 40000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await page.waitForTimeout(700);
  }
  return false;
};
const clockRunning = (page) => page.locator('.timer-hud [role=timer]').count();

async function breakIsOver(taken) {
  const a = await newPlayer(browser, {
    email: `e2j11a${uniq()}@example.com`,
    name: 'Ann' + uniq(),
  });
  const page = a.page;
  await reachLibrary(page);
  await sitAndStartPomodoro(page);
  await skipTime(page, 26 * 60_000); // the first block ends, the break begins
  await waitFor(
    page,
    async () => /Break/.test(await page.locator('.timer-hud').innerText()),
    15000,
  );
  await page.mouse.click(640, 620); // stand up and walk off into the room
  await page.waitForTimeout(5000);
  check(
    `${taken ? 'taken' : 'free'}: stood up for the break`,
    (await page.locator('.seat-bar').count()) === 0,
  );
  if (taken) {
    // Someone else sits in that chair while the break goes on.
    const b = await newPlayer(browser, {
      email: `e2j11b${uniq()}@example.com`,
      name: 'Bob' + uniq(),
    });
    await reachLibrary(b.page);
    await tapChair(b.page);
    await b.page
      .locator('[role=dialog] .choice')
      .first()
      .waitFor({ timeout: 40000 })
      .catch(async (e) => {
        await shot(b.page, 'E2-dbg-bob');
        throw e;
      });
    await b.page.locator('[role=dialog] .choice').first().click();
    await b.page
      .locator('[role=dialog] .panel-button')
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(2000);
  }
  await skipTime(page, 6 * 60_000); // the break ends
  const ready = await waitFor(
    page,
    async () => /Break's over/.test(await page.locator('.timer-hud').innerText()),
    15000,
  );
  if (!ready) throw new Error('the break never ended');
  await page.locator('.timer-hud .panel-ok').click();
  await page.waitForTimeout(600);
  const hud = await page.locator('.timer-hud').innerText();
  check(
    `${taken ? 'taken' : 'free'}: the block does not start at once`,
    (await clockRunning(page)) === 0,
  );
  if (!taken) {
    check('free: told it is walking back', /Walking back/.test(hud));
    const started = await waitFor(page, async () => (await clockRunning(page)) > 0, 60000);
    check('free: the block started after sitting', started);
    check('free: seated again', (await page.locator('.seat-bar').count()) > 0);
  } else {
    const noted = await waitFor(
      page,
      async () => /chair was taken/.test(await hudText(page)),
      30000,
    );
    check('taken: a note says the chair is taken', noted);
    await page.waitForTimeout(8000);
    check('taken: still no block, nobody sat on the wrong chair', (await clockRunning(page)) === 0);
    check('taken: not seated', (await page.locator('.seat-bar').count()) === 0);
  }
  await gotIt(page);
  // Leave, so the next scenario starts with an empty library and a free chair.
  await a.context.close();
}

try {
  const only = process.argv[2];
  if (only !== 'taken') await breakIsOver(false);
  if (only !== 'free') await breakIsOver(true);
} catch (e) {
  console.error(e.message);
  await browser.close();
  console.log('INCONCLUSIVE');
  process.exit(2);
}
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
