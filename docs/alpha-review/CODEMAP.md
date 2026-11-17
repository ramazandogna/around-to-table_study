# CODEMAP: around-to-table_study

Single read pass, 2026-11-17. Line numbers are for this checkout. Paths are relative to repo root.

## 1. Modules & responsibilities

**packages/shared/src** (pure rules, used by client and server; tests in `packages/shared/test`)
- `protocol.ts`: client msg zod schema `:107`, `ErrorCode` `:219`, `ServerMessage` `:254`, `parseClientMessage` `:312`, name rules `:322`
- `social.ts`: friends/DM/admin socket schema `:52`, server msgs `:229`, `parseSocialMessage` `:272`
- `world/areas.ts`: area layouts `AREAS` `:43` (hall, library, smoking, conference, room3/5/9); `world/grid.ts`, `pathfinding.ts`, `tiles.ts` (ASCII layouts)
- `rules.ts`: per-area limits `AREA_RULES` `:51`, `applyAreaRules` `:155` (caps, links, cooldown, profanity)
- `character.ts` (`PETS` `:65`, looks), `status.ts` (`DOINGS`, `MOODS`, `VIBES`, `DANCES` `:80`, `EMOTES` `:83`, status lines `:58`)
- `study.ts` (timer plans, `MAX_TIMER_MS` `:9`, `PLAN_RHYTHMS` `:57`), `profile.ts` (blocks, streaks, `BADGES` `:91`)
- `stage.ts` (conference screen), `jukebox.ts`, `tables.ts` (darts/pig/guess), `parlor.ts` (quick games), `events.ts` (weekly + proposals), `staff.ts` (`SHIFTS` `:21`), `rooms.ts` (room codes, rules), `profanity.ts`, `time.ts`, `presence.ts`, `health.ts`, `text.ts`
**apps/server/src** (Cloudflare Worker + Durable Objects; tests in `apps/server/test`)
- `index.ts`: `fetch` router `:447` (routes `:449-466`), `secretOf` `:50`, `isLocal` `:78`, `startSession` `:82`, `googleSignIn` `:96`, `googleCallback` `:103`, `devSignIn` `:123`, `logout` `:135`, `doorOpenFor` `:145`, `me` `:163`, `door` `:186`, `play` `:261`, `characters` `:213`, `rooms` `:345`
- `area-room.ts`: `AreaRoom` DO `:123`, one per public area or private room; WebSocket dispatch `handle` `:419`; tables, jukebox, stage, lamps, study state; rate constants `:87-102`
- `social-hub.ts`: `SocialHub` DO `:165`, a single instance named `hub`. Holds accounts, sessions, characters, presence, friends, DMs, shouts, blocks, private rooms, events, admin roles. Socket dispatch `handle` `:767`
- `accounts.ts`: cookies `:8-13`, `BETA_MODES` `:107`, door pass `signPass` `:119` / `doorOpen` `:135`, Google OAuth `googleStart` `:179`, `googleFinish` `:204`, `verifyIdToken` `:252`
- `auth.ts`: game tokens `Session` `:8`, `signSession` `:82`, `verifySession` `:86`, room pass `ROOM_PASS_MS` `:95`
- `env.ts` (`Env` `:4`, bindings and secrets), `rate-limit.ts` (`takeToken` `:7`)
**apps/client/src** (React 19, zustand, three.js via `WorldCanvas`/`AreaWorld`)
- `App.tsx` (lobby vs game gate; `fetchMe` `:55`; area-entry effects `:109`), `main.tsx`, `net/startOver.ts` (new data epoch)
- `net/`: `AreaConnection.ts` `:33` (area WS), `SocialConnection.ts` `:35` (friends WS), `account.ts` (`/api/me`, `/api/door`, `/api/play`), `rooms.ts` (`enterRoom` `:62`), `heartbeat.ts`, `session.ts`, `storage.ts`, `enter.ts`, `social.ts`
- `state/`: `store.ts` `useGameStore` `:623` (zustand, 1097 lines), `study.ts`, `daily.ts` (3 goals per day), `stats.ts` (device-only)
- `world/`: `AreaWorld.ts` `:204` (2476 lines, scene controller), `buildArea.ts` `:139` (layout to 3D), `IsoView.ts`, `Avatar.ts` `:151`, `Pet.ts` `:134`, `Staff.ts` `:168`, `minimap.ts`, props (`smokingProps`, `tableProps`, `conferenceProps`, `arcade.ts`), decor (`ambience`, `eventDecor`, `renovation`, `flaws`, `paintings`, `floors`, `doors`, `smoke`, `emotes`, `petGear`)
- `ui/`: HUD and panels (`Hud`, `Panel`, `TimerHud`, `StudyRing`, `SeatBar`, `Goals`, `Calendar`, `Phone`, `Friends`, `Inbox`, `Rooms`, `Jukebox`, `RoomMusic`, `Games`, `ParlorGames`, `TableGames`, `StageScreen`, `PlayerCard`, `StatusDialog`, `EmoteMenu`, `Gate`, `Intro`, `Coach`, `Wardrobe`, `CharacterCreator`, `CharacterSelect`)
- `audio/` (`sound.ts` SFX and footsteps, `music.ts` event loops), `content/` (topic jars, discoveries, boards, `cozy.ts`, events; EN and TR), `i18n/` (`t.ts`, `en.json`, `tr.json`)
**Other**: `site/` (Vue landing page, section 6), `scripts/deploy.mjs` (deploy with a fresh access code), `.github/workflows/{ci,site}.yml`, `docs/` (`decisions.md`, `lessons.md`, `alpha-review/`).

## 2. Areas to code

Layout: `packages/shared/src/world/areas.ts` (`hall` `:45`, `library` `:75`, `smoking` `:117`, `conference` `:137`, `room3` `:168`, `room5` `:184`, `room9` `:201`). Rules: `rules.ts:51`. Server: `area-room.ts`. Client: `AreaWorld.ts`, `buildArea.ts`.

- **Entrance hall / reception** (`hall`)
  - Layout: `areas.ts:45`. Stone floor `floors.ts:37`. Cork board `ui/NoticeBoard.tsx`. Intro note `ui/Intro.tsx`.
  - Staff: `receptionDay` 07-19 and `receptionNight` 19-07 (`staff.ts:21-26`). The receptionist calls the elevator (`world/Staff.ts:288`, `elevatorFront` `:641`).
  - Hall-only client logic: `AreaWorld.ts:1078`, `:1830`, `:2448`.
  - Private-room browser (open rooms, join by code, open your own): `ui/Rooms.tsx`. Server: `social-hub.ts` `createRoom` `:658`, `checkRoom` `:704`; HTTP `index.ts:345`.
- **Elevator and private rooms** (`room3`, `room5`, `room9`)
  - Elevator ride: `AreaWorld.ts:2448-2461` (arrival at room3 front, return to `hall`).
  - Pass: `auth.ts:95-110` (12 h), issued through `/api/rooms`.
  - Owner rules (sound, pets, games): `shared/src/rooms.ts:23`. Set with `social-hub.ts:1621` (`setRoomRules`).
  - Bans and kicks: `social-hub.ts:1604`, `:1611`, `sendOut` `:1633`, `closeRoom` `:1647`. Idle expiry 24 h (`rooms.ts:20`).
  - Unopened strips are drawn as renovation (`world/renovation.ts`). Opening one: `area-room.ts` `grow` `:857`.
- **Library** (`library`)
  - Rules `rules.ts:51` (no chat log, caps off, no DMs, 75 s cooldown, no dance or smoke).
  - Librarian shifts: `staff.ts:21-25` (day 09-15, evening 15-22, night 22-09). Staff in `world/Staff.ts`.
  - Lamps: server `area-room.ts:573` (`LAMPS_KEY` `:94`); client applies the 15:30 house rule.
  - Décor: `world/flaws.ts` (cracked pane, shuttered window, taped shelf), `paintings.ts`, `doors.ts` (sliding glass), `ambience.ts`. Board: `content/boards.ts`, `ui/NoticeBoard.tsx`.
  - Study count in HUD: `ui/Hud.tsx:65`.
- **Smoking room** (`smoking`)
  - Rules `rules.ts:51` (300 chars, links allowed, 3 s cooldown, smoke on).
  - Smoke: protocol `smoke` `area-room.ts:591` (only where allowed, `:463`). Client `world/smoke.ts`, `smokingProps.ts`.
  - Jukebox: `ui/Jukebox.tsx`, `shared/src/jukebox.ts` (`JUKEBOX` `:8`, `parseYouTubeId` `:52`), server `addTune` `area-room.ts:759`, `skipTune` `:793`, limit `TUNES_PER_MINUTE` `:100`.
  - Room music: `ui/RoomMusic.tsx`, `content/cozy.ts`. Machines: `ui/Games.tsx` and `world/arcade.ts`.
  - Table games: `ui/TableGames.tsx`, `shared/src/tables.ts`, server `table` `area-room.ts:608` and `playTable` `:737`.
  - Quick games: `ui/ParlorGames.tsx`, `shared/src/parlor.ts`.
  - Timer break hint: `ui/TimerHud.tsx:96`.
- **Conference hall** (`conference`)
  - Rules same as hall (`rules.ts:51`). Stage model `shared/src/stage.ts`: `STAGE_KINDS` `:15`, `cleanStage` `:88`, `controlStage` `:126`, `conferenceRole` `:164`, `conferenceEnd` `:181`.
  - Server: `stageShow`, `stageControl`, `stageClear` `area-room.ts:657-683`; `setStage` `:330`; `mayPresent` `:340`. Also `index.ts:433` and `social-hub.ts` `conferenceRole` `:1223`.
  - Client: `ui/StageScreen.tsx`, `world/stageView.ts`, `world/conferenceProps.ts`. The audience is blocked from the stage tiles (`AreaWorld.ts:2300`).
## 3. Protocol (`packages/shared/src/protocol.ts`)

**Client to server** (`clientMessageSchema` `:107-202`):
`hello{look,from?,status?,lines?}` · `move{to}` · `say{text<=300}` · `look{look}` · `status{status}` · `lines{lines}` · `emote{emote}` · `dance{on,move?}` · `afk{on}` · `smoke{on}` · `pat{owner}` · `table{kind,action}` · `tune{link}` · `skip{id}` · `tuneLength{id,seconds}` · `finished` · `chair{tile,pulled}` · `lamp{index,flipped}` · `stageShow{kind,src,caption?}` · `stageControl{action,at?}` · `stageClear` · `invite{to,code,name}` · `poke{to}` · `whisper{to,text}`
**Server to client** (`ServerMessage` `:254-310`):
`welcome{self,tile,area,players,opened,lamps,stage?,now?,presenter?}` · `joined{player}` · `left{id}` · `moved{id,to}` · `placed{id,tile}` · `said{id,text,at}` · `status{id,status}` · `looked{id,look}` · `lined{id,lines}` · `emoted{id,emote}` · `poked{from,to}` · `danced{id,on,move}` · `smoked{id,on}` · `afked{id,on}` · `chaired{tile,pulled}` · `lamped{index,flipped}` · `grew{opened}` · `staged{stage,now,presenter?}` · `roomRules{rules}` · `patted{id,owner}` · `table{kind,table}` · `tableError{kind,code}` · `jukebox{state}` · `whispered{from,to,text,at}` · `finished{id}` · `invited{from,code,name}` · `error{code,retryInMs?}`
**ErrorCode** (`:219-252`): `swearing`, `bad_message`, `rate_limited`, `blocked`, `replaced`, `link_blocked`, `dnd`, `unavailable`, `not_allowed`, `seat_taken`, `kicked`, `banned`, `room_closed`, `tune_bad|tune_full|tune_long`, `stage_link`, `stage_host`, `not_presenter`, and table errors.

**Social socket** (`social.ts`, route `/api/social/ws`). Client: `where`, `find`, `befriend`, `unfriend`, `dm`, `history`, `read`, `buzz`, `shout`, `block`, `unblock`, `profile`, `propose`, `review`, `role`, `admins`, `roomRules`, `roomOut`, `roomUnban`, `roomClose`, `roomBans`. Server: `friends`, `found`, `friendEvent`, `dm`, `history`, `seen`, `buzzed`, `me`, `shouted`, `shouts`, `profile`, `events`, `reviewed`, `approved`, `blockedBy`, `admins`, `roomBans`, `world`, `error`.

**HTTP** (`index.ts:449-466`): `GET /api/health`, `GET /api/auth/google`, `GET /api/auth/google/callback`, `GET /api/auth/dev`, `GET /api/me`, `POST /api/logout`, `POST /api/door`, `POST /api/play`, `/api/characters[/:id[/look|save]]`, `/api/profile`, `/api/rooms[/:code]`, `/api/social/ws`, `/api/areas/:id/ws`.

## 4. Feature inventory

- **Study timers**: `shared/src/study.ts` (activities focus, reading, online, quiet; plans pomodoro, deep, marathon, custom, free, together; max 3 h). Client: `state/study.ts`, `ui/TimerHud.tsx`, `ui/StudyRing.tsx`, `ui/SeatBar.tsx`, `ui/SitDialog.tsx`. Server: `area-room.ts` `storeStudy` `:897`.
- **Goals and daily tasks**: `ui/Goals.tsx` (ready-made or own goal, filled by focus time), `state/daily.ts` (3 per day, same for everyone by date), `state/stats.ts` (device-only streaks).
- **Quick games**: parlor (rps, coin, duel, ttt, chain, math, emoji; best of 3 or 5): `parlor.ts`, `ui/ParlorGames.tsx`. Table (darts, pig, guess; 2 to 4 players, 40 s turns): `tables.ts`, `ui/TableGames.tsx`. Arcade (paper plane, claw): `ui/Games.tsx`, `world/arcade.ts`.
- **Jukebox and room music**: `ui/Jukebox.tsx`, `ui/RoomMusic.tsx`, `shared/src/jukebox.ts`, `area-room.ts:621-660`, `content/cozy.ts`, `audio/music.ts`.
- **Pets**: 7 kinds (`character.ts:65`). `world/Pet.ts`, `pets.ts`, `petGear.ts`. Pat via `area-room.ts:601`. Waiting pets in `social-hub.ts` (`MAX_WAITING_PETS` 8, `social.ts:210`).
- **Friends, phone, DMs, shouts, buzz**: `social.ts` (`DM_MAX_CHARS` 500, `DM_HISTORY` 200, `MAX_FRIENDS` 200). Server: `social-hub.ts` `befriend` `:889`, `dm` `:936`, `history` `:981`, `buzz` `:1037`, `shout` `:1359`. Client: `ui/Friends.tsx`, `ui/Phone.tsx`, `ui/Inbox.tsx` (HUD bell), `net/SocialConnection.ts`, `net/social.ts`. DMs are off in the library.
- **Events and calendar**: `shared/src/events.ts` (`EVENTS` `:51`, `checkProposal` `:110`, `eventNow` `:176`), `content/events.ts`, `ui/Calendar.tsx` (clock, calendar, proposal form), `world/eventDecor.ts`, `audio/music.ts`. Server: `social-hub.ts` `propose` `:1534`, `review` `:1581`, `tellEvents` `:1524`. Admins approve.
- **Stage**: `shared/src/stage.ts`, `ui/StageScreen.tsx`, `world/stageView.ts`, server `area-room.ts:657-683`. Image, YouTube, or audio over https from known hosts only.
- **Staff NPCs**: `shared/src/staff.ts` (librarian day, evening, night; reception day, night). `world/Staff.ts`. Closed-sign helper `:590`.
- **Collectibles and discoveries**: shelves, paintings, renovation notes and flaws. `world/paintings.ts`, `flaws.ts`, `renovation.ts`, `content/discoveries.{en,tr}.ts`, `ui/Discovery.tsx`. Badges: `profile.ts:91`, shown in `ui/PlayerCard.tsx` and `ui/CharacterSelect.tsx`.
- **Emotes, dances, smoke**: emotes wave, laugh, heart, sleepy, thinking, cheer, sad, coffee (`status.ts:83`). Dances bounce, sway, robot, disco, twist, cheer. Client: `world/emotes.ts`, `ui/EmoteMenu.tsx`, `world/poses.ts`, `world/smoke.ts`. Server: `area-room.ts:545` (1.5 s cooldown), `:551`, `:591`.
- **Status lines**: doing (8), mood (7), vibe (chat, buddy, quiet), announcement up to 40 chars, note up to 20 (`status.ts:10-58`). `ui/StatusDialog.tsx`, `net/session.ts`.
- **Characters and wardrobe**: `ui/CharacterCreator.tsx`, `CharacterSelect.tsx`, `Wardrobe.tsx`, `CharacterPreview.tsx`, `world/outfit.ts`, `world/Avatar.ts`. Server: `index.ts:213`, `social-hub.ts` `createCharacter` `:512` (max 2 per account).
- **Intro, notices, coach**: `ui/Intro.tsx` (opens on first visit), `ui/Coach.tsx` (one tip per room, once), `ui/Notice.tsx`, `content/boards.ts`.
- **i18n**: client `i18n/t.ts` (en, tr), `en.json`, `tr.json`, `content/*.en.ts` and `*.tr.ts`. Site: `site/src/i18n.ts` (en, tr, zh, ja).
- **Safety**: `profanity.ts` (EN and TR masking), `rules.ts` (caps, links, cooldown, length), `applyAreaRules` at `area-room.ts:514` and `:715`. Rate limits: `area-room.ts:87-102`, `social-hub.ts:96-105`, `rate-limit.ts`. Blocks `social-hub.ts` `block` `:1331`. Room bans `:1604`. Password-try limits `passwordTry` `:629` and `index.ts:186`. Stale sockets `presence.ts`. A second tab closes the first (`CLOSE_REPLACED` 4000).
- **Admin tools**: `ADMIN_EMAILS` (`env.ts:4-9`, role in `index.ts:169`). Server: `setRole` `social-hub.ts:1260`, `adminList` `:1246`. Client: `ui/PlayerCard.tsx:121-130` (make or unmake admin), `ui/Calendar.tsx:207-326` (approve events). Room tools: `roomOut`, `roomClose`, `roomBans`; `kick` in `area-room.ts:398`.
- **Time and season**: `shared/src/time.ts` (day phases, seasons, heaters or fans), `world/ambience.ts`.
## 5. Test coverage

23 test files: 18 in `packages/shared/test`, 3 in `apps/server/test`, 2 in `apps/client/src`.
- Shared: `protocol`, `character`, `events`, `health`, `jukebox`, `parlor`, `presence`, `profanity`, `profile`, `rooms`, `rules`, `social`, `staff`, `stage`, `status`, `tables`, `time`, `world` (layouts and renovation).
- Server: `accounts` (door pass, beta modes, door tag), `auth` (game tokens), `rate-limit`.
- Client: `content.test.ts` (EN and TR content parity), `i18n/catalogs.test.ts` (key parity, placeholders).
Notable untested:
- `apps/server/src/area-room.ts` (1008 lines: every in-area message, tables, jukebox, stage, lamps, rate limits).
- `apps/server/src/social-hub.ts` (1665 lines: friends, DMs, shouts, blocks, rooms, bans, events, roles, profiles).
- `apps/server/src/index.ts` routing, including `/api/door`, `/api/play`, `/api/characters`, `/api/rooms`, `/api/me`.
- Google OAuth (`accounts.ts:179-294`) and dev sign-in.
- `shared/src/study.ts` timer maths, `pathfinding.ts` (only indirect), `client state/study.ts`, `daily.ts`, `stats.ts`.
- Client world and UI: `AreaWorld`, `buildArea`, `Avatar`, `Pet`, `Staff`, `store.ts`, all `ui/*`. None are tested.
- `site/` (no tests) and `scripts/deploy.mjs`.
## 6. Site (`site/`)

- Stack: Vue 3, Vite 8, Tailwind 4, vue-i18n, vue-router, rei-kit glass components, lucide icons. It has its own `package.json` and lockfile. `pnpm-workspace.yaml` lists only `apps/*` and `packages/*`, so the site is outside the workspace.
- Files: `index.html`, `src/main.ts`, `src/App.vue` (landing: nav, hero, sections `#rooms` `:397`, `#pets` `:459`, `#features` `:520`, `#beta` `:543`, footer), `src/PlayGate.vue` (beta modal), `src/gate.ts` (`gateOpen`, `openGate`), `src/HeroBubble.vue`, `src/Cursor.vue`, `src/i18n.ts` (`COPY` per language), `src/more.ts` (gate and chatter copy), `src/extra.ts`, `src/motion.ts`, `src/sound.ts`, `src/style.css`, `public/` (hero, scene and UI webp images, logo, favicons).
- Build: `vue-tsc --noEmit && vite build`. Vite `base` is `/around-to-table_study/` for build and preview (GitHub Pages). CI: `.github/workflows/site.yml` runs on push to `main` when `site/**` changes, with `pnpm install --frozen-lockfile --ignore-workspace` and `pnpm build`, then deploys to GitHub Pages.
- **Funnel**:
  - Nav and hero "play" buttons (`App.vue:252`, `:326`) call `openGate`, which opens the `PlayGate` modal.
  - Modal "Play": navigates to `GAME_URL` (`App.vue:42`, the workers.dev URL of the Worker that serves the game).
  - Modal "Explore": closes and scrolls to `#rooms` (`PlayGate.vue:17-20`).
  - Modal "ask" and nav feedback and bug links are `mailto:` (`App.vue:68-70`, `:188`, `:284`, `:551`, `:554`, `:596`).
  - Footer: GitHub profile, rei-kit docs, and `terms.html` and `privacy.html` on the game origin (`App.vue:603-610`; sources in `apps/client/public/`).
## 7. Running locally

```
pnpm install                                            # root engines say node >=22; .nvmrc says 24; pnpm 10
cp apps/server/.dev.vars.example apps/server/.dev.vars  # then set SESSION_SECRET (openssl rand -hex 32)
pnpm build                                              # Worker serves apps/client/dist; build once
pnpm --filter @att/server dev                           # wrangler dev: game + API at http://localhost:8787
pnpm --filter @att/client dev                           # vite at http://localhost:5173, proxies /api (incl. ws) to :8787
# site (separate lockfile):
cd site && pnpm install && pnpm dev                     # dev base is "/"; Vite uses the next free port if 5173 is taken
```
Checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

`apps/server/.dev.vars` keys (the example file lists only `SESSION_SECRET`):
- `SESSION_SECRET`: required, at least 32 characters. Without it, `secretOf` returns null and the door stays shut.
- `ADMIN_EMAILS`: comma-separated owner emails (admin role).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: enable Google sign-in. Setting the ID turns off local dev sign-in.
- `ACCESS_PASSWORD`: door code. Unset means the door is open locally.
- `BETA_MODE`: `code` (default), `allowlist`, or `open`. `ALLOWED_EMAILS`: list for `allowlist`.
## 8. Auth flow

1. **Google sign-in** (production): `Gate.tsx` shows a "G" link to `/api/auth/google` (`index.ts:96`). `googleStart` (`accounts.ts:179`) sets a PKCE cookie and redirects to Google. Google returns to `/api/auth/google/callback` (`index.ts:103`). `googleFinish` (`accounts.ts:204`) verifies the ID token (`:252`), then `SocialHub.signIn` (`social-hub.ts:413`) creates or finds the account. `startSession` (`index.ts:82`) creates a row (`social-hub.ts:445`) and sets cookie `att_session` (30 days, `accounts.ts:8-13`), then redirects to `/`. Needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET`, else 503 `google_not_set`.
2. **Local test sign-in**: `devSignIn` (`index.ts:123`) is live only when `GOOGLE_CLIENT_ID` is unset and the request host is `localhost` or `127.0.0.1`. Otherwise it returns 404. `/api/me` reports `devSignIn: true` (`index.ts:165`). `App.tsx:55` stores it. `Gate.tsx:33-50` shows an email form only when `import.meta.env.DEV` is true and Google is off. Submitting does a full-page `GET /api/auth/dev?email=...`. The server validates the email, then signs in account `sub: dev:<email>` with name = part before `@`, and runs `startSession`. There is no password, so any local visitor can sign in as any email.
3. **Door** (access code): `Gate.tsx` calls `enterDoor(code)` (`net/account.ts:64`), which does `POST /api/door` (`index.ts:186`). That route applies per-account and per-IP try limits, compares the code, and sets cookie `att_pass`. The pass is `signPass` (`accounts.ts:119`), keyed by `SESSION_SECRET:door:<code>`, so each deploy's new code ends all passes. `doorOpen` (`accounts.ts:135`) applies `BETA_MODE`. With no `ACCESS_PASSWORD`, the door is open.
4. **Play**: `play(id)` (`net/account.ts:88`) does `POST /api/play` (`index.ts:261`). It needs an open door and returns a signed game token (`auth.ts:82`; `Session` `:8` holds id, name, iat, acct, and presence nonce). Sockets take the token in `?token=`. `takePresence` (`social-hub.ts:592`) keeps one live tab per character.
5. **Sign-out**: `POST /api/logout` (`index.ts:135`) clears `att_session` and `att_pass`.
6. **Client state**: `account.ts` `fetchMe` (`:49`) reads `/api/me`. Account data is not kept in localStorage. Per-character progress lives in localStorage (`account.ts:102-170`). The playing character id lives in sessionStorage (`account.ts:129`).
