/* global console, process, document */
// T1-11 evidence: node T1-offline.mjs 140 -> while offline the client shows no sign; the server has already dropped the player.
import { chromium, newPlayer, uniq } from './helpers.mjs';
const OFF = Number(process.argv[2] ?? 20) * 1000;
const browser = await chromium.launch();
const A = await newPlayer(browser, { email: `off${uniq()}@t1.test`, name: 'Offa' + uniq() });
const W = await newPlayer(browser, { email: `w${uniq()}@t1.test`, name: 'Watch' + uniq() });
const nameA = await A.page.locator('.avatar-name').first().innerText();
const wSeesA = () => W.page.evaluate((n) => [...document.querySelectorAll('.avatar-name')].some(e => e.innerText.startsWith(n)), nameA);
await A.context.setOffline(true);
await A.page.waitForTimeout(1500);
const a = A.page.getByPlaceholder('say something…'); await a.fill('lost-msg-1'); await a.press('Enter');
console.log('input after offline send:', JSON.stringify(await a.inputValue()), 'shown on A:', (await A.page.evaluate(() => document.body.innerText)).includes('lost-msg-1'));
await A.page.waitForTimeout(OFF);
console.log('W sees A before online', await wSeesA(), 'A banner:', (await A.page.evaluate(() => document.body.innerText)).match(/reconnect\w*|offline|connection lost/i)?.[0]);
await A.context.setOffline(false);
await A.page.waitForTimeout(8000);
await a.fill('after-online-' + OFF); await a.press('Enter');
await W.page.waitForTimeout(3000);
const wt = await W.page.evaluate(() => document.body.innerText);
console.log('W got after-online msg:', wt.includes('after-online-' + OFF), 'W got lost-msg-1:', wt.includes('lost-msg-1'), 'W sees A', await wSeesA());
await browser.close();
