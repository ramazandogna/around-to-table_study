/* global console, process, document */
// Opens 3 players in separate contexts and checks each sees all three ("3 here").
import { chromium, newPlayer, shot, uniq } from './helpers.mjs';
const browser = await chromium.launch();
let ok = false;
try {
  const stamp = Date.now() % 100000;
  const names = ['Ada', 'Bo', 'Cy'].map((n) => n + uniq());
  const players = await Promise.all(
    names.map((n) =>
      newPlayer(browser, { email: `${n.toLowerCase()}${stamp}@example.com`, name: n }),
    ),
  );
  ok = true;
  for (const [i, { page }] of players.entries()) {
    const here = await page
      .waitForFunction(() => /\b3 here\b/.test(document.body.innerText), null, { timeout: 15000 })
      .then(
        () => true,
        () => false,
      );
    const text = await page.evaluate(() => (document.body.innerText.match(/\d+ here/) ?? ['?'])[0]);
    console.log(`${names[i]} sees: ${text}`);
    if (!here) ok = false;
  }
  await shot(players[0].page, 'smoke-3p');
} catch (e) {
  console.error(e);
}
await browser.close();
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
