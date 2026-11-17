# Test setup (A1)

## Start (from repo root)
```
pnpm install && pnpm build
pkill -f wrangler; pkill -f workerd; pkill -f vite     # before any restart
pnpm --filter @att/server dev                          # game + API, http://localhost:8787
(cd site && pnpm install --ignore-workspace && pnpm dev)  # website, http://localhost:5173
```
- `site/` is NOT in the pnpm workspace: it needs its own `pnpm install --ignore-workspace`.
- The worker serves `apps/client/dist`: after changing client code run `pnpm build` again (no watch).
  Alternative with HMR: `pnpm --filter @att/client dev` (Vite, also 5173; clashes with the site, pass `--port`).
- `apps/server/.dev.vars` (gitignored) holds only `SESSION_SECRET`. No GOOGLE_CLIENT_ID, no ACCESS_PASSWORD:
  local email sign-in works and the door is open.

## Sign in locally
Open `http://localhost:8787/api/auth/dev?email=anyone@example.com` (sets the session cookie, redirects to `/`).
The built client has no email form (it is `import.meta.env.DEV` only), so use that URL.
Then: lobby "new" card (`.lobby-new`) or "Play as them" -> name field (`placeholder="your name"`) -> "Enter" button
-> canvas -> intro note (`.intro-ok`). Character names are UNIQUE globally (`name_taken` -> 400); state lives in
`apps/server/.wrangler/state` (delete it to reset all accounts/characters, with the worker stopped).

## Helper: docs/alpha-review/repro/helpers.mjs
```js
import { chromium, devices, newPlayer, shot, uniq } from './helpers.mjs';
const browser = await chromium.launch();
const { page, context } = await newPlayer(browser, { email: `a${uniq()}@x.com`, name: 'Ada' + uniq(), viewport: { width: 1280, height: 800 } });
await shot(page, 'my-name');   // -> docs/alpha-review/shots/my-name.png, scale 1
```
- Returns a page in the Entrance Hall with the intro dismissed. HUD shows "N here" for the room population.
- `newPlayer(..., { contextOptions })` is spread into `newContext` (use for devices/clock).
- Run: `node docs/alpha-review/repro/smoke-3p.mjs` (3 contexts, each must see "3 here"; prints PASS, exit 0).
- Phone: `contextOptions: { ...devices['iPhone 13'] }` and pass `viewport: devices['iPhone 13'].viewport`
  (the explicit viewport wins over the device one otherwise). Touch UI uses the joystick.
- Fake clock: do not use `clock.setFixedTime` (freezes time, breaks timers/animation). Shift Date instead via
  `context.addInitScript(() => { const R = Date, off = 2 * 3600e3; globalThis.Date = class extends R {
  constructor(...a) { a.length ? super(...a) : super(R.now() + off); } static now() { return R.now() + off; } }; })`
  before `newPlayer` navigates (pass the context via `contextOptions` is not possible: create the context yourself
  or call `page.context().addInitScript` then `page.reload()`).

## Baseline (clean tree, 2026-11-17)
- `pnpm typecheck`: PASS. `pnpm test`: PASS (client 5, server 17 tests). `pnpm build`: PASS (chunk-size warning only).
- `pnpm lint`: PASS (after the helper scripts carry `/* global ... */` headers; node globals are not configured for .mjs).
- `pnpm format:check`: PASS.
- smoke-3p: PASS (repeated 3x).

## Gotchas
- Worker logs: /tmp/worker.log, site: /tmp/site.log (when started by A1).
- Stale `name_taken` is the usual cause of "stuck on creator" failures; always use `uniq()`.
- Canvas is WebGL; names/people are not DOM. Use HUD text ("N here", panel text) or screenshots to assert.
- A coach hint ("Got it") shows at the bottom on first entry; click it if it covers a shot.
- Wrangler may print a CORS/ws noise; ignore. Port 8787 must be free before start.
