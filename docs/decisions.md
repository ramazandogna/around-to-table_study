# Decisions

Non-obvious technical decisions, newest first.

## 2026-11-01: The early beta has a door code that changes with every deploy
- **Decision:** `pnpm run deploy` runs `scripts/deploy.mjs`: it makes an 8-character password (letters and digits, no look-alikes), uploads it as the `ACCESS_PASSWORD` secret together with the code (`wrangler deploy --secrets-file`, a temporary file removed right after) and prints `password: XXXXXXXX` under the worker's address. Making a character needs it. The password is part of the key that signs sessions and room passes, so a new one ends every old session at once; the browser notices (`/api/access`), forgets the session and asks for the name and the code again, keeping the look. Wrong tries are limited (8 per address in ten minutes). Without the secret (local development) the door is open.
- **Why:** Links were going around; only people given this week's code should come in, without accounts yet.

## 2026-11-01: The building starts over by a data epoch
- **Decision:** `DATA_EPOCH` in `shared/constants.ts`. When the social hub or a room wakes up with an older epoch, it drops everything (guests, friendships, messages, rooms, numbers, tables, the jukebox) once; browsers clear what the game kept. Bumped to 2 for the beta's fresh start; the next bump starts over again.

## 2026-11-01: The smoking room always has music
- **Decision:** Calm piano, guitar and string pieces by Kevin MacLeod (CC BY 4.0, credited in the player and CREDITS) are served from `public/music` and play all the time, at the room's point by the clock, from memory (each file is fetched whole, so seeking works without range requests). A queued YouTube song takes over in YouTube's own player, kept at 200×200 as YouTube's terms ask, and the calm music comes back after. The card opens on coming in; "–" tucks it away (a YouTube player stays 200×200), "✕" stops it on that screen. A clear "tap to listen" appears when a browser blocks sound. There is no "music only" check for YouTube songs: that needs a YouTube Data API key (category 10).

## 2026-11-01: Walking with keys and a joystick; taps are for people and things
- **Decision:** Touch screens get an on-screen joystick (any direction) besides tapping; desktops keep WASD and the arrows. Tapping the floor still walks, for newcomers, but the crowd problem (people covering the tile behind them) is solved by walking with the stick or the keys. A sofa now asks before sitting, and the player hops onto it.

## 2026-11-01: More pets, made from fewer models
- **Decision:** Seven pets: cat, beagle (the Kenney dog), corgi, dachshund and shiba (the Kenney dog reshaped: body length and width, leg length, ears, tail, a fur colour of their own, with the clips reshaped to match), rabbit and a turtle built in code with its own clips. Each kind has its own speed, silliness and chatter; rabbits hop, a turtle pulls its head in. Accessories sit on the body, or on the turtle's head.

## 2026-11-01: A landing page in the game's colours, on rei-kit's glass
- **Decision:** `site/` is a small Vue 3 + Tailwind 4 page on rei-kit 4.4 (`data-material="glass"`), the game's palette mapped onto rei-kit's roles, in English (default), Turkish, Chinese and Japanese. It is outside the pnpm workspace (own lockfile, installed with `--ignore-workspace`) and published to GitHub Pages by `.github/workflows/site.yml` whenever `site/` changes.

## 2026-11-01: Roles, blocks and the building chat live in the social hub
- **Decision:** Roles are `user` and `admin`. The owner's guest ids are set on the server (`ADMIN_IDS`, a secret) and are always admins; admins make others admins from their profile card. Blocking is stored in the hub: it ends the friendship and its conversation, stops messages, buzzes and friend requests there, and the rooms ask the hub before passing a poke, whisper or invite; the blocked person is told. Muting is on the player's device only and nobody is told. A building-wide chat (last 50 lines) is a second tab next to the room's chat; the library reads it but does not post.
- **Why:** One place for who may do what, checked on the server, without a new resource.
- **How to become admin:** open your own profile (the ring around you → Profile), copy "Your ID" and run `wrangler secret put ADMIN_IDS` with it (comma-separated for several). A guest who starts over gets a new id.

## 2026-11-01: Profiles count focus blocks the rooms saw finish
- **Decision:** When a room sees a timer really run out (`finished`), it records the block in the hub (`focus_blocks`). A profile counts blocks today, this week (from Monday), this month and this year on the person's own clock (their offset comes with `where`), sorts them by length (25 pomodoro, 50 deep, 90 marathon, others custom), and adds time in the building, friends, messages sent, the best streak and the day they joined. Badges are worked out from these numbers (`shared/profile.ts`).
- **Why:** Numbers others can trust, so effort shows; badges need no storage of their own.

## 2026-11-01: Events can be proposed and wait for an admin
- **Decision:** Anyone proposes a one-off event (title, line, room, start, length; 3 waiting at most). Admins see the waiting ones in the calendar and approve, turn down or later take them off; the proposer is told. Approved events join the weekly ones everywhere: the clock, the calendar's "Coming up next" card, the board, and the room's decorations.

## 2026-11-01: Private rooms have rules and an owner
- **Decision:** Opening a room sets three switches: notification sounds, pets, and a game table (Pig and Higher-lower; darts stay in the smoking room). The owner's room settings change them live, send someone out (they may come back) or ban them (the hub refuses their pass), unban, and close the room for good.

## 2026-11-01: Chairs are pulled out, and sitting waits for a choice
- **Decision:** Chairs start pushed in under their tables. Arriving at one pulls it out and asks what you will work on; you sit once you choose, and "Not now" steps you off. Others see someone sit once their status has an activity. Standing up after sitting pushes the chair back in (a `chair` message tells the room); a chair left out (no choice, or a closed tab) goes on the librarian's list after 40 seconds and she walks over and pushes it in.
- **Why:** Sitting down is a decision in a library, and the librarian should have work, not just wander.

## 2026-11-01: The building follows the hour and the month
- **Decision:** The light follows the viewer's hour: morning, day, a yellower afternoon, an evening with desk lamps on and the town's lights in the windows, and a night with every lamp on, the moon in the glass and the library desk closed (laptop shut). Window panes are our own meshes over the Kenney windows; the librarian opens and shuts them by day. Heaters hang under windows from November to March, fans in summer.

## 2026-11-01: A loader that ends on a whole bounce
- **Decision:** Changing rooms shows the logo bouncing on a card until the new room answers; the time is rounded up to whole bounces (1.2 s each, at least two), and it gives up after 8 s.
- **Why:** The prompt asked for a consistent loader that rounds a wait up. Rounding to five seconds every time would slow down walking between rooms, which people do all the time, so the loader rounds to its own animation instead; `LOADER_CYCLE_MS` and `MIN_MS` change it.

## 2026-11-01: Staff work shifts and pick their moments from the clock
- **Decision:** `shared/staff.ts` holds the shifts: a day (9–15) and an evening (15–22) librarian, nobody at night (a "back at 9:00" sign), and a day and a night receptionist. Who is on follows the viewer's local hour. What they do is chosen per 12-second slot by a seeded random of the slot number (`chance`), with at most one errand a minute, so it never loops visibly and every screen agrees. The receptionist walks to the elevator when the player asks for a room (on that player's screen only).
- **Why:** The reception handled rooms without anyone behind it, and a librarian on a fixed 150-second loop felt robotic.

## 2026-11-01: Table games are decided by the server
- **Decision:** Darts, Pig (dice) and Higher-lower are pure functions in `shared/tables.ts`; the smoking room's Durable Object keeps one table per game (in storage, so hibernation keeps it), rolls the dice and keeps the secret number, and sends everyone the same state. A turn left for 40 seconds is played for the absent player when anyone at the table asks (`nudge`). Darts are scored by the server from where the dart landed; the swaying aim is drawn by the thrower's screen.
- **Why:** Two to four people need to see one game. Casual darts trust the landing point; dice and secrets cannot be trusted to a client.

## 2026-11-01: The jukebox plays YouTube in YouTube's own player
- **Decision:** People queue YouTube links (2 each, 20 in all). The server checks each video with YouTube's oEmbed (exists and may be embedded, gives the title) and keeps the song and its start time; every screen plays it in the official embedded player at the room's point in it, at a low volume (12 of 100 by default, never above 30). The first screen to learn a song's length tells the server, which moves on when it ends (an alarm); the person who queued it may skip it, anyone else asks and half the room skips it.
- **Why:** Hosting music would need licences; the embedded player is how YouTube allows playback elsewhere. Its terms ask for the player to stay visible (at least 200×200), so it sits in a corner card that anyone can switch off on their screen. Live streams have no length and play until skipped.

## 2026-11-01: The phone works everywhere; the library only makes it quiet
- **Decision:** A new `phone` rule (true everywhere) replaces `dmAllowed` for friends' messages; `dmAllowed` now only means whispers to someone in the same room. In the library, or while studying, a message only shakes a little phone by the player's name. Friends see each other's room, whether they study, their vibe, mood and announcement, and when they were last online; read receipts, buzzes, "where I am" (a marker that becomes a "go there" button) and a friend link (`?friend=<id>`) were added.
- **Why:** A phone that stops working in the library was a rule against how phones work; the quiet is about sound, not about the phone.

## 2026-11-01: Private rooms behind a pass
- **Decision:** Anyone can open a private room for 3, 5 or 9 people from the reception or the elevator. Rooms live in the social hub's SQLite (name, size, salted password hash, owner) and are forgotten after 24 hours empty; each room runs in its own Durable Object (`room:CODE`). Joining checks the password once over HTTPS and returns a signed pass for that guest and that room (12 hours), so passwords never travel in socket URLs. Invites go three ways: a link (`?room=CODE`), a phone message whose marker becomes a "join" button, and the player card.
- **Why:** Group study and private talk are the third pillar of the app. One registry and one pass check keep rooms on the free plan without a new resource.
- **Later:** Bigger and decorated rooms are shown as coming later (likely premium); owners cannot kick or change passwords yet.

## 2026-11-01: Events run on the clock, dressed by themes
- **Decision:** `shared/events.ts` holds the calendar as weekly events in their own time zone (a fixed UTC offset; Japan has no daylight saving). Every screen works out on its own whether an event is on; the smoking room then hangs bunting, string lights and a banner, and plays procedural lo-fi music with its own switch. A theme (colours, lights, music) dresses the room, so special days (a Turkish, Thai or Chinese day) only need a theme and a calendar entry.
- **Why:** No server state, no wake-ups, and everyone sees the same thing. Only the Thursday 21:00 (Japan) meetup is on the calendar for now.

## 2026-11-01: Studying has plans, breaks and company
- **Decision:** Sitting down opens a ring of plans (pomodoro, deep focus, marathon, your own, stopwatch, together). Each is explained in the middle and only starts after a yes. Breaks follow focus blocks on their own and suggest the smoking room; the next round waits for the player. "Together" joins someone's running block so both finish at once. Time focused, blocks and a day streak are kept on the device only.
- **Why:** The app's promise is studying with others and meeting people between blocks; the rhythm leads from the library to the smoking room and back. No rankings: the numbers are there to feel good, not to compete.

## 2026-11-01: Things to do in the smoking room
- **Decision:** Kenney's Mini Arcade (CC0) puts an arcade cabinet, a claw machine and a coffee machine in the smoking room. The games are one-tap (playable on a phone); coins are free. A good score or a prize is said in the room's chat, and a coffee shows over your head. Topic jars on the side tables (hall and smoking room) make your character ask the room a light question.
- **Why:** People need a reason to stay and something to talk about; a shared moment ("won a 🦊!") or a question breaks the ice better than an empty room.

## 2026-11-01: A pet can be dressed
- **Decision:** The look carries the pet's sex, fur colour (recoloured per vertex like the characters, on the pets' own atlas) and one thing to wear (collar, bell, bow, scarf, party hat, glasses), built from simple shapes on the pet's body. The hall's library door shows waiting pets as they look.

## 2026-11-01: Chairs are picked by their whole shape
- **Decision:** A tap is matched against every free chair's and sofa's upright box on screen before the floor, like people. The renovation's tall shade no longer catches taps; only its floor does.
- **Why:** Picking the floor alone sent half of the taps on a chair to the tile behind it (often the desk), and the desk next to the renovation could hardly be chosen at all (0 of 27 sample taps).

## 2026-11-01: Dialogs are drawn into the page, not where they are opened
- **Decision:** `Dialog` renders through a portal into `document.body`.
- **Why:** The wardrobe and status dialogs live in the HUD plate, which folds on phones; opened from the ring of actions they were hidden inside it and all appeared at once when the plate opened.

## 2026-11-01: Presence is kept honest with a heartbeat
- **Decision:** Both sockets send `ping` every 25 s. The Durable Objects answer it with `setWebSocketAutoResponse`, so they never wake up for it, and an alarm every 30 s drops any socket that has been quiet for more than 100 s (`isStale` in `shared`). "Start over" also calls `POST /api/leave` with this device's token, which closes that guest's sockets everywhere at once.
- **Why:** The building counted "4 here" while nobody could be seen. Hibernated sockets of phones put to sleep or tabs that vanished without a close frame stayed open for a long time, and starting over only forgot the guest on the device.
- **Trade-offs:** A phone left in the background disappears from the room after about two minutes and walks back to its chair when it returns. There is no admin "reset the world" button: the sweep makes it unnecessary, and a button for everyone would be abused. If one is ever needed, it should only answer to a secret.

## 2026-11-01: Outfit colours are vertex colours on the white swatch
- **Decision:** The look keeps its character and adds optional palette indexes for `skin`, `hair`, `top`, `bottom` and `shoes` (left out = as drawn) and an optional `pet`. `world/outfit.ts` sorts every vertex of a character into one of those parts once, from the bone it follows, its height and its colour swatch. A recoloured vertex points its UV at the atlas's white swatch and takes its colour from vertex colours, and each avatar gets its own geometry.
- **Why:** Each Mini Character is just two meshes on one shared colour atlas, and parts often share a swatch (trousers and a belt), so repainting swatches would recolour the wrong things. Working per vertex keeps eyes, glasses, hats, soles and a crutch as drawn. Old `{ character }` looks stay valid.
- **Limits:** Hair can be recoloured but not reshaped (each character has one haircut). Where a model draws shoes and trousers in one swatch (two of the men), the shoes are taken as everything below ankle height.

## 2026-11-01: Pets follow their person, and wait outside the library
- **Decision:** Pets are Kenney "Cube Pets" (CC0), in the same style as the characters. Only the cat can be chosen for now; the dog and the rabbit are shown as "coming soon". `world/Pet.ts` holds the behaviour every kind shares: it follows its person's path about a second behind, potters about when they stand still (stumbling, chasing its tail, bumping into things, pouncing), and waits. `AREA_RULES.pets` keeps them out of the library. The social hub tells the hall which pets are waiting at the library door.
- **Why:** A pet needs no messages of its own: where it goes follows its person, and its kind travels in the look. Its little antics are picked by each screen on its own, which nobody can tell apart.

## 2026-11-01: The librarian runs on the clock
- **Decision:** The librarian is an `Avatar` driven by `world/Librarian.ts`. What she does (at her desk, off to a shelf, back, dozing) is worked out from the wall clock in rounds of 150 s, so every visitor sees the same thing with nothing sent. She sits on a staff chair (`Q`) that nobody else can walk onto, and she is not counted in any numbers.
- **Why:** Simulating her on the server would wake the room's Durable Object every few seconds for nothing. Screens whose clocks differ by a few seconds see her a few seconds apart, which does not matter for a librarian.

## 2026-11-01: A finished session is celebrated, and checked by the server
- **Decision:** A soft bell rings at each quarter of a study timer for its owner alone, even in the quiet library. At the end the client sends `finished`; the server accepts it only when that person's timer has really run out (with 5 s of grace), clears the timer and broadcasts it. Everyone in the room sees a big burst of stars, the one exception to the library's small, still emotes.
- **Why:** Finishing is the moment the library is for, and checking it on the server means nobody can celebrate on a loop.

## 2026-11-01: Room chat lines carry the server's time
- **Decision:** `said` and `whispered` include `at`, the server's clock. The chat shows "name · time" above a run of lines from one person within three minutes.
- **Why:** Lines without a time were hard to follow once the room had been quiet for a while.

## 2026-11-01: Kenney Mini Characters replace the painted character
- **Decision:** Players pick one of the twelve Kenney "Mini Characters" (CC0; six women, six men, each with its own face, hair and outfit). The look is `{ character: index }`. The models came from a GitHub mirror of Kenney's CC0 library, since kenney.nl refuses automated downloads.
- **Why:** The old single unisex body with a painted skin could not show clearly different women and men. The new kit ships real walk, sit and gesture clips. Studying at a desk, dancing and waving are posed on its simple rig in `poses.ts`.
- **Trade-off:** Looks from before are invalid, so returning players pick a character once. Colours came back on top of this kit (see "Outfit colours are vertex colours").

## 2026-11-01: The library grows a desk at a time
- **Decision:** Library seats are desks for two (12 seats at launch). The renovation zone opens in strips. Whenever more people are in the room than open chairs, the next strip (a desk for two) opens, is stored in the room's Durable Object, broadcast as `grew`, and never closes again.
- **Why:** A big half-empty table felt like an invitation nobody answered. Growing with the crowd keeps the room full and shows the community grow.

## 2026-11-01: One person per seat, many per tile
- **Decision:** The server refuses a move onto a chair or sofa someone else sits on (`seat_taken`). Floor tiles have no limit; people sharing a tile step apart into a small ring on screen.
- **Why:** Sitting in someone's lap was a bug. Blocking floor tiles would make a busy smoking room impossible to walk through.

## 2026-11-01: Sounds are made with Web Audio
- **Decision:** Clink, phone buzz, footsteps, pops and chimes are synthesised in `audio/sound.ts`. One mute button covers everything. Notification sounds stay quiet in the library, while seated at a desk and with "do not disturb".
- **Why:** No files to load or license, and each sound stays tiny.

## 2026-10-31: Movement is continuous, keys follow the screen
- **Problem:** walking was tile by tile at 1.9 tiles/s along 4-direction zigzags, with a stop at every tile when using keys; the arrow keys moved along the map's axes, which on the isometric screen is diagonal; the walk clip was a slowed-down run (fists, pumping arms).
- **Movement:** A* now runs in 8 directions (no cutting the corners of walls, furniture or chairs) and `smoothPath` turns the tiles into as few straight lines as can be walked with a body's width. Avatars follow those lines at 3 tiles/s, speeding up and braking just in time for the last point, and turn smoothly. The server still only knows tiles and checks that the target is reachable.
- **Keys** point where they point on screen (up is screen-up), two keys walk diagonally, and the body slides along walls. Letting go brakes onto the tile ahead, so people always rest on a tile (and sit when it is a chair); a quick tap still takes one step. While steering, the client sends the tile just ahead, so others see a steady walk rather than a stop at each tile.
- **Animation:** the walk is posed on the skeleton (`createWalkCycle`): thighs swing, knees bend most in the swing, the foot rolls heel to toe, arms swing against the legs, the hips rise and fall so the standing foot stays on the floor. Idle, walk and sit are blended by speed and sitting instead of cross-faded, and the walk plays exactly as fast as the body moves. `run.fbx` is no longer shipped.

## 2026-10-31: Two notice boards, guidance on what a tap does
- **Boards:** the hall has a cork *community board* (flyers at odd angles, pins and tape: welcome, events, the break room, meeting people, house rules); the library a brass-framed green felt board with printed *library notices* (quiet rules, how studying works, the table, study sessions). Both the 3D board and the panel look the part. Events and study sessions are lists in `apps/client/src/content/boards.ts` until there is an admin screen.
- **Guidance:** with a mouse, a tip next to the pointer says what a click does ("Sit here and study", "Go to Library", "Under renovation"...). Free chairs glow softly while you stand, so phones (no hover) see where to sit too. Each room shows one short tip on the first visit. The library HUD shows how many people are studying.

## 2026-10-31: The library reads as a library
- The long table stays the heart of the room (the concept). Around it: two back-to-back stacks behind the table, the wall shelves, a librarian's desk beside the way in, a reading corner with a sofa by the door, and plants with floor lamps. Floor lamps now stand inside the plant's tile, so nobody walks through them.
- Freestanding bookcases two rows deep face away from each other.

## 2026-10-31: The phone (DMs) runs on the SocialHub socket
- **Decision:** 1:1 messages between friends go over the same SocialHub socket and are stored in its SQLite (`messages` table, newest 200 per conversation). A message reaches every open tab of both people; offline friends see it as unread when they come back.
- **Rules:** friends only; up to 500 characters (`DM_MAX_CHARS`); case is kept; links are refused like in the hall; 8 messages per 10 s per person. Removing a friend deletes the conversation.
- **Unread** is a column per message, counted per friend into the friends list (`Friend.unread`), so badges stay right across tabs and reloads. Opening a conversation (`history`) or reading it while open (`read`) clears it.
- **The library silences the phone:** it cannot be opened and the server refuses sending (`phone_silent`). Messages still arrive, and the Phone link only shows a dot. Leaving the library says "N new messages on your phone".
- **Whispers stay:** a whisper is to someone in the same room and is not stored; the phone is for friends anywhere.

## 2026-10-31: Friends live in one SocialHub Durable Object
- **Decision:** friendships are rows in the SQLite storage of a single `SocialHub` Durable Object (tables `users`, `friends`), not in D1 yet. Every player keeps one socket to it (`/api/social/ws`) next to the area socket; it carries friend requests, the friends list and presence (online + which room) across rooms.
- **Why:** it deploys with no manual setup (no `wrangler d1 create`), stays on the free plan with hibernation, and one object comfortably serves the 200 users we design for. The same socket is where whispers to friends in other rooms and the phone (DMs) will go. If it ever outgrows one object, the two tables move to D1 unchanged.
- **Ids:** guest ids are permanent, so friendships survive the upgrade to a real account. A request needs the other person to have connected once (they are in `users`).
- **Quiet rooms:** in the library a request only raises a badge on "Friends"; elsewhere it also shows a notice. Accepting always shows one.
- **Asking back accepts:** a request to someone who already asked you makes you friends.

## 2026-10-31: Status lines, emotes and crowds
- **Status lines** (`shared/status.ts`) are chosen by hand and stay until changed: an announcement (40), what you are doing (preset + 20) and a mood (preset + 20). They are separate from the table activity, which comes from sitting down. Links are refused in every line; they are kept on the device like the look.
- **Emotes** are broadcast once (1.5 s apart per person) and never stored. Where `effectsVisible` is off (the library) they show small and still; elsewhere they pop and lively ones make the body hop. Real gestures wait for a character pack with emote animations.
- **Crowds:** every 0.2 s the client measures the name tags on screen. When tags overlap, or more than 6 people are on screen, other people's lines fold into one icon row (tap to open for 6 s); your own stay open. Speech bubbles step up out of each other's way, and one that would have to move more than 110 px folds to 💬 (the chat panel still has the text).
- **Labels are anchored at the name tag's bottom**, so bubbles and lines grow upwards without moving the name.

## 2026-10-31: Social layer: room chat, player card, notice boards
- **Room chat:** every room except the library has a chat panel (`AreaRules.chatLog`). It is per room and starts empty on entering; there is no global chat across rooms, so a room stays a place. "Do not disturb" hides other people's lines too.
- **Player card:** tapping a person or their name opens a card. Poke (one per 10 s, only the target sees it) and whisper (same room only, not in the library, shares the room's chat cooldown) work now. Friends and groups are shown as "coming soon" because they need accounts (Phase 5).
- **Do not disturb is enforced on the server:** pokes and whispers to someone with 🔕 are refused with `dnd`.
- **Timers belong to the library.** Standing up with a running timer asks: short break (keeps it), finish (stops it) or stay. Leaving the library asks too, and leaving ends the timer; staying steps back inside.
- **Notice boards** are a layout tile (`N`), so they block walking like furniture. One stands beside the way in, in the hall and in the library; it opens when you stop next to it. Events are a list in `apps/client/src/content/announcements.ts` until there is an admin screen.
- **Hover:** with a mouse, the tile under the pointer lights up when a tap would act on it (yellow for people, doors, seats and boards).

## 2026-10-30: Characters are painted from a look
- **Decision:** a look is `{ skin, hair, hairColor, top, topColor, bottom, bottomColor }`, each an index into `LOOK_OPTIONS` in `shared` (validated by range in zod). `world/skin.ts` paints a 512 px texture on Kenney's UV layout in its flat style (face, ears, hair edge, sleeves, neckline, hems, jeans stitching, shoes) and caches it per look. The Kenney skin PNGs are gone.
- **Why:** the shipped skins are zombies, bloodied survivors and a cyborg, or half-photographic; none fit a study app, and they cannot be mixed. Painting gives a real creator today with no new assets.
- **Where it shows:** the creator (`ui/CharacterCreator.tsx`, Stardew-style arrows and swatches with a turning 3D preview) runs before entering, for players from before it existed, and in the game as the Wardrobe. A `look` message changes the look live; others get `looked`.
- **Limit:** hair is painted on the head, so long styles cannot reach the shoulders. Real hairstyles need hair meshes or a modular character pack, which is the next character decision.

## 2026-10-30: Area rules live in `shared/rules.ts`
- **Decision:** `AREA_RULES` holds each area's chat length, cooldown, caps, links and the flags for effects, sounds, DMs and the chat log. `applyAreaRules` cleans a message, blocks links where they are not allowed and lowercases it where caps are not. The server applies it to every message; the chat bar mirrors it for early feedback.
- **Turkish-aware lowercasing:** "İ" always becomes "i"; "I" becomes "ı" only when the text has Turkish-only letters, so English "I" still becomes "i". The chat bar keeps the typed text and only shows it lowercase (with `lang="tr"` for Turkish), so the whole message is lowercased at once and "IŞIK" becomes "ışık", not "işık".
- **Cooldown:** the time of each person's last message is stored per area in Durable Object storage, so leaving and coming back does not reset the library's 75 seconds. Early messages get `rate_limited` with the time left, which the send button shows as a countdown.

## 2026-10-30: The hall is laid out by how people move
- **Decision:** the hall has a street entrance (`O` tiles, drawn as a door, never walkable) at the bottom, in line with the library's glass doors; new arrivals start just inside it. The rug runs straight from one to the other. Reception stands front right, facing the people coming in, on the way to the elevator; the smoking room and sofas are on the left.
- **Why:** reception should face the entrance and arriving and leaving should not cross (feedback from an interior designer). Before, people appeared in the middle of the room and the desk faced nothing in particular.

## 2026-10-30: Taps on doors look above the floor
- **Decision:** a tap is turned into a floor tile as before; when that tile is not walkable, the same ray is checked at heights up to 2.1 m for a door or elevator tile.
- **Why:** doors are tall, so tapping the glass landed on the floor behind the wall, outside the map, and nothing happened. It felt like an invisible wall in front of the library.

## 2026-10-30: Study status travels with the player
- **Decision:** a `status` message carries `{ activity, timer, dnd }` and replaces the whole status; it is also sent in `hello`. The server keeps the timer as an end time on its own clock and sends it out as `remainingMs`, so clients with wrong clocks agree. An activity only counts while the server sees the player on a seat, and any move clears it.
- **Why:** others must see what is on your table and whether you have a timer or do not want to be disturbed. Sending time left instead of a clock time avoids clock skew without a time sync.
- **Client:** the player's own status lives in the Zustand store; `AreaWorld` pushes changes to the avatar and the server. Remote avatars show props only once seated, and drop them when they move.

## 2026-10-30: One panel style and the Tiny5 font
- **Decision:** every dialog is built from `ui/Panel.tsx` (wooden frame, parchment face, choice cards, checkbox, green OK), inspired by Stardew Valley's character creator. The UI font is Tiny5, self-hosted with `@fontsource/tiny5`, with `font-synthesis: none`.
- **Why:** one look from the name screen to the table makes the app feel like one place. Pixelify Sans was tried first, but its 2 and 5 look like Z and S, which breaks a timer. Tiny5 has clear digits and Turkish letters; it has a single weight, so hierarchy comes from size.

## 2026-10-30: Doors are built in code
- **Decision:** `world/doors.ts` builds each door run from the layout: a 4-tile sliding glass double door for the library, a 1-tile swinging wooden door elsewhere, each with a frame, doormat and sign. Doors open when anyone is near. Back-wall doors are complete, with a strip of the next room's floor behind them (starting past the door's own floor tile; overlapping it made the two floors flicker); front-wall doors keep only the frame and mat so they do not hide the room.
- **Why:** Kenney's open doorway frame did not read as a door. Wide doors also needed custom geometry, since Kenney's pieces are one tile wide.

## 2026-10-30: Walk speed comes from the clip
- **Decision:** `measureStrideSpeed` samples the walk clip and measures how fast a planted foot moves backwards; the walk's `timeScale` is the avatar speed divided by that. The walk keeps most of the run's leg motion (15% towards idle) but calms the arms and body (60%). Avatars move at 1.9 tiles per second.
- **Why:** a hand-picked time scale left the feet moving at a third of the ground speed, so characters slid.

## 2026-10-29: One tile is about a meter
- **Decision:** Kenney furniture is loaded at 5 units per tile (twice its own grid) and characters are 1.7 tiles tall. Doors are 2 tiles tall, chairs 0.4 wide, the library table 1.2 deep.
- **Why:** At Kenney's own scale a tile is about 2 m, so one seat per tile left four chairs of empty space between neighbors and the table looked huge. At 1 m per tile people sit shoulder to shoulder, like Habbo and Sanalika.
- **Note:** chairs are squashed to 75% height so the short-legged characters can reach the floor when seated.

## 2026-10-29: Walk and sit are derived in code
- **Decision:** `world/poses.ts` builds the walk from the run clip (each key pulled towards the idle pose; see "Walk speed comes from the clip") and a seated "studying" pose by aiming the leg and arm bones in model space.
- **Why:** Kenney's Animated Characters only ship idle, run and jump. Each FBX also contains a one-frame "Targeting Pose", which was played by mistake as the walk; clips are now picked by name.
- **Seating is client-side:** a player whose tile is a seat (`AreaGrid.seatFacing`) sits after standing still for a moment. Every client knows the layout, so sitting itself needs no message (what is on the table does; see "Study status travels with the player").

## 2026-10-29: Isometric 3D with three.js instead of 2D pixel art
- **Decision:** The world is rendered with three.js: a fixed isometric orthographic camera looking from the south-east, Kenney's CC0 Furniture Kit for rooms and Kenney's Animated Characters for players. Phaser and the Roguelike tilesets are removed.
- **Why:** The 16×16 top-down look could not carry the warmth we want (Sanalika/Habbo). The isometric library pack the maintainer first chose is a set of renders of these same 3D models, so using the models gives that look plus characters that turn, walk and can later sit and wave.
- **How:** ASCII layouts in `shared` stay the single source of truth for collision; `buildArea.ts` turns them into instanced Kenney models. Only the north and west walls are built so the camera can see in. Names and speech bubbles are DOM elements (CSS2DRenderer), so text stays crisp and is easy to style.
- **Model facing:** in our loaded space chairs, bookcases and sofas open towards -z (the chair's backrest is on +z); `buildArea.ts` adds half a turn for them.
- **Characters are temporary:** Animated Characters only has idle, jump and run. Kenney's "Mini Characters" (cuter, with walk/sit/emote animations) replaces them once downloaded from kenney.nl; only `world/characters.ts` and `CHARACTER_SKINS` change.


## 2026-10-29: Multiplayer on plain Durable Objects
- **Decision:** One `AreaRoom` Durable Object per area, using the WebSocket Hibernation API directly instead of `partyserver`. The client uses `partysocket`'s `ReconnectingWebSocket`.
- **Why:** The server side is ~200 lines without the extra framework, and hibernation is the part that keeps us on the free plan. Per-connection state lives in the socket attachment so it survives hibernation.
- **Movement:** clients send only a target tile. The server checks reachability with the shared A* and broadcasts the target; every client walks remote players there with the same pathfinding. A rejected move gets a `placed` reply that snaps the player back.
- **Reconnects:** the server places a returning player at the door they came through; the client then walks to where it actually is.

## 2026-10-29: Guest sessions are HMAC-signed tokens
- **Decision:** `POST /api/guest` returns `payload.signature` (HMAC-SHA256 with `SESSION_SECRET`). The token is stored in localStorage and sent when opening an area socket. Guest tokens do not expire yet.
- **Why:** No database is needed for Phase 2, and nobody can join as someone else. Expiry and revocation come with real accounts in Phase 5.

## 2026-10-29: (superseded) Top-down pixel view with Kenney Roguelike tiles
- **Decision:** Stay with a top-down 16×16 pixel view using Kenney's CC0 "Roguelike pack" (floors, walls, windows, doors, chairs, carpets) and "Roguelike Indoor pack" (tables, plants, shelves). Both sheets live in `apps/client/public/tiles/` so CI and deploys have them. The "Isometric Miniature Library" pack is not used: it is isometric and rendered, not pixel art.
- **Layouts stay ASCII** in `packages/shared/src/world/areas.ts`; `drawArea.ts` maps each character to Kenney frames (wall rims are auto-tiled from neighbors). This keeps one source of truth for collision on client and server. Tiled maps can replace this when areas need hand-placed decoration.
- **Bookcases:** Kenney has no full bookcase tile, so the indoor shelf tile is refilled with book spines in Kenney palette colors at runtime (`bookcase.ts`).
- **The library table** is one long oval table (Kenney's oval table pieces are one row tall), with chairs on both sides.

## 2026-10-29: Grid movement with 4-directional A*
- **Decision:** Characters move tile by tile. Tapping runs A* in `shared`; tapping a blocked tile walks next to it. Renovation zones and the elevator are blocked with an explanation bubble.
- **Why:** Tile targets are what the server will receive in Phase 2, which keeps network traffic within the free tier.

## 2026-10-29: Monorepo layout and single Worker deploy
- **Decision:** pnpm workspaces with `apps/client` (Vite + React + Phaser), `apps/server` (Cloudflare Worker) and `packages/shared`. The Worker serves the client build as static assets and handles `/api/*` itself.
- **Why:** one deploy, one URL, shared TypeScript types, and everything stays on the Cloudflare free plan.

## 2026-10-29: `@att/shared` is consumed as TypeScript source
- **Decision:** `packages/shared` exports `src/index.ts` directly; there is no separate build output.
- **Why:** both Vite and Wrangler bundle TypeScript, so a build step for shared code would only add friction.

## Landing page motion (site)

The landing page is a game's front door, so it moves: a lamp-dot cursor that leaves paw prints (mouse and trackpad only), cards that lean toward the pointer, sections that rise in on scroll, the five reasons as a self-advancing picker, the beta steps lit one after another, and a pets section where each pet greets you in its own way. Everything stops for visitors who ask their system for reduced motion. The language is a small dropdown instead of a four-way switch, so the bar stays one row on a phone; the links move into a menu sheet below the large-screen breakpoint. Pets are shown with the same emoji icons the game's creator uses, not renders.

## Night stays bright enough to study by

Evening and night used to drop the light to a third, which made the rooms hard to read. Night now keeps most of the daylight but turns it cool and blue, with the lamps warm on top: it reads as night without hiding anyone. The game is also an installable web app (a manifest, no service worker: it needs the server to be useful, so there is nothing to keep offline).

## Footsteps on the landing page

Hovering something that moves gives the game's soft footstep and a click gives a firmer one, synthesised the same way as in the game. Browsers allow sound only after the first click or tap, and a speaker button (in the menu on phones) turns it off for good.

## Round E: lights, language, crowds and manners

- **Night is lit from inside.** Evening and night keep about 90% of the day's floor brightness in warm lamp colour; night shows in the windows and the lamps. No pendant lights were added: the general light was the cause, not missing fixtures.
- **Library lamps have switches.** Each floor lamp in the library is its own object with its own shade. The server stores only which lamps are *flipped* against the house rule (off before 15:30, on after), and every screen applies the rule by its own clock, so players in different time zones agree on what was switched. The librarian walks over after two minutes and puts a flipped lamp back with a word.
- **Turkish.** `tr.json` mirrors `en.json`; a test fails on a missing key or a changed `{slot}`. A Turkish device starts in Turkish; the 🌐 button switches and reloads, because signs in the 3D scene are drawn once. The language survives a data epoch reset.
- **Six dances** go over the wire as an index into `DANCES`; the dance button opens a ring of its own.
- **Crowds.** Three or more people within 0.9 tiles share one name tag ("Selin +3", friends and yourself excluded). A tap on overlapping people opens a "who?" ring before their own ring.
- **Idle.** 2 minutes without input shows 💤 to everyone; after 5 the character wanders to shelves, paintings, the lost-and-found box, the jukebox. Studying at a desk is never idle. Sitting down on a sofa while idle is not done yet.
- **Pets walk the owner's path** (breadcrumbs), at their own speed, with a short pause when the owner sets off and sniff stops on long walks (not the turtle). They only appear next to their person beyond 30 tiles (a reconnect).
- **Find by name** searches people online now; blocked pairs never see each other. Friend requests are limited to 20 per 10 minutes.
- **Swear filter** (EN + TR, our own list) masks words in chat, phone and building chat, and refuses names, room names, event titles and status lines. Whole-word matching with a few stems; "sık", "got", "pic", "sıkışık" are deliberately not on it. Three masked messages in 10 minutes make the next one wait a minute.
- **Terms and privacy** are static pages (EN + TR) at `/terms.html` and `/privacy.html`, marked as a draft that a lawyer must check.
- **Rooms are opened at the reception.** The create tab sends the player to the desk; the form there offers Silent / Chat / Game as presets of the existing rules, then hands over the key with the link.
- **Event decorations** start 15 minutes before an event; the music waits for the start, and the hall shows a sign over the door to the venue.

## Round F: the conference hall, and the gaps from round E

- **The hall's left wall** has the smoking room's door up in its corner and the conference hall's double door lower down. The two west-wall paintings moved to the wall between and below them.
- **The conference hall** is its own area (`conference`), as big as the library, reached from the hall. It is self-contained (no library rules), so it can move to a separate building later by changing only the door.
  - A raised stage (tiles `^`, 0.3 above the floor; people and pets step up onto it), a microphone (`I`), a 16:9 screen on the back wall that rises above it, and rows of theatre chairs (`W`) facing the stage with an aisle. Theatre chairs are sat on like sofas (no question asked) at chair height; all are one instanced mesh per part.
  - Standing at the microphone shows a 🎤 by the name. Real voice is out of scope.
- **Who may come in.** The conference hall is closed except from 15 minutes before an approved event held there until it ends: then everyone may come in and the person who proposed it presents. Admins, and a local server with no access password, may always come in and present. The worker asks the social hub before letting anyone in (`conferenceRole`); the client checks the same rule first and explains why the door stays shut.
- **The big screen is not a screen share.** The presenter, standing on the stage, opens one thing and every screen in the hall loads it itself:
  - A **picture**: an https link to an image file from an allow list (imgur, Wikimedia, Unsplash, GitHub, ibb, Twitter's image host).
  - A **YouTube video**: reduced to its 11-character id and played in YouTube's own privacy-enhanced player without its controls.
  - A **sound**: an https link to an audio file from an allow list (Wikimedia, archive.org, GitHub, Free Music Archive, Pixabay), with a volume of each listener's own.
  - Nothing is fetched or relayed by the worker.
  - The server keeps `{kind, src, caption, startedAt, pausedAt}` in storage; the position is computed from the server's clock, sent with every change, so a late joiner lands on the right second and a paused video stays paused.
  - Captions are masked for swears.
  - 20 changes a minute per presenter.
  - PDFs and uploads are left for later: they need storage and are hard to read on a phone. The message has room for new kinds.
- **The screen sits on the wall.** The page with the picture or the player is laid over the 3D screen with a 2D transform onto its four projected corners (the camera has no perspective, so it is a parallelogram), and follows the camera. When the screen is smaller than YouTube's 200-pixel minimum (a phone, zoomed out), it opens as a card instead; anyone can enlarge it or hide it on their own screen.
- **Event proposals pick a theme** (meetup, Turkish day, Thai day, Chinese day); the theme dresses the room. The conference hall can host events.
- **Crowds.** With 12 or more people around, those off the screen are not drawn and those more than 9 tiles away lose their shadow and name tag (friends keep the tag). Measured on a software renderer this saves only 1–2 ms a frame; on a real GPU (WebKit, iPhone 13 profile) 30 people already ran at 60 fps. The cost on the software renderer is the lit pixels of each visible body, not shadows or tags.
- **The phone's welcome note and notices stand beside the joystick**, not under it. The top-left menu on phones was already one button.
- **A daily goal** (30 minutes to 4 hours, one hour by default) is kept on the device next to the streak, shown as a bar in the study ring and at the end of a session, and cheered once a day. Nobody else sees it; there is no ranking.
- **Pets come in through the door** after their person, a slow pet later than a quick one; other people's pets do the same when they arrive.
- **Idle.** After a minute without input the character looks around now and then and sometimes yawns or thinks (others see the emote). Of the wanders after five minutes, about a third go to sit on a sofa or armchair.
- **Faces in name searches.** The social hub keeps each person's look; one small hidden renderer draws a face from it once per look.
- **Library desk lamps have switches too**, after the floor lamps in the same index list, with the same house rule and librarian.
- **The house rule keeps the library lit at night:** lamps are due on from 15:30 until 07:00 (before, the rule switched them off after midnight). From 22:00 to 09:00 no librarian is on duty, so nobody puts a switched lamp back; the morning librarian does.
- **Picking someone out of a crowd** shows a soft ring on the floor under them while the "who?" ring points at them, and under whoever's ring of actions is open.
- **With a key from the reception** the player walks to the elevator and rides up; from anywhere else (an invite, a link) they go up at once.

## Round G: an open conference hall, characters, goals, quick games

- **The conference hall is always open.** Anyone may come in, sit and listen. Only the person presenting an approved event held there (from 15 minutes before it until it ends), admins and anyone on a local server may change the big screen. The server asks the social hub again at every change of the screen, so someone whose event starts while they are inside can present without coming back in, and someone whose event ended cannot. What is shown for an event comes down when the event ends (the room's alarm wakes at that moment); what an admin shows outside an event stays until cleared.
- **Library desks are a mix of tables for four (two facing two) and desks for two**, with the same 20 chairs. The open part has two tables for four and two desks for two; the renovation opens a table for four, then two desks for two (three strips instead of four). A table with chairs on both sides has no modesty panel and its lamp in the middle.
- **The library is never unstaffed.** A third shift, the night librarian Bora, keeps the desk from 22:00 to 09:00. He dozes off at the desk most of the time (the head drops slowly and jerks back up, 💤 over the name), walks slower with a slight sway, and gets round to a switched lamp only after about 45 seconds, yawning. This replaces round F's "nobody puts a lamp back at night".
- **The librarian mops.** In about a quarter of the five-minute windows, the librarian on duty mops a straight stretch of open floor away from chairs, back and forth for 48 seconds, mop in hand, with the bucket at one end; the yellow wet floor sign stays up until the window ends. It is worked out from the clock, so every screen sees the same; staff never block anyone, so nobody bumps into them.
- **Exit to the character select.** "Exit game" in the menu counts down 3, 2, 1 before it can be pressed. Confirming leaves the world: the area and the phone sockets close, so everyone sees the player leave. The character select screen shows the device's characters; "Join" comes straight back as the same character, without reloading.
  - **Two characters per device, no accounts.** Each character is its own guest (name, look, session) with its own stats, goals, daily tasks and prizes. The one being played lives in the usual storage keys; the other waits in `att.characters` as a copy of its keys. Switching swaps the two and reloads the page, so nothing from one character leaks into the other's state. Deleting a character removes its keys and tells the server it left. A new data epoch or "start over" clears everything as before.
  - **Each card shows** the face (the portrait renderer), name, badges, time in the world, time studied, streak and today's progress against the daily goal. Badges, time in the building and focus time come from the server (`GET /api/profile?token=…`, only for the token's own profile); offline, or with a session ended by a new password, the numbers kept on the device are shown.
- **Goals and quests.** "Goals" in the menu sets up to five goals for the day: ready-made ones ("Read a book · 60 min", "Solve problems · 45 min"…) or one in the player's own words (checked for swears), with a length. Focus time from the study timer fills the goal being worked on; progress starts over each day, the goals stay. A quests panel by the minimap lists today's goals and small tasks with their progress; tapping its head folds it to an icon (remembered; folded by default on phones).
- **For people who do not come to study** (chosen because they cost little and use what the building already has):
  - **Three small tasks a day**, the same for everyone on the same date, ticked off by playing: a break in the smoking room, a look at the conference hall, a painting's story, a book from a shelf, a table game, a dance, the lost and found, a word in the chat, a while with the timer. They give a newcomer a reason to walk around and find what the building offers.
  - **A collection**: paintings and book moments found so far ("found 7 of 42"), so the stories already written become something to complete.
  - **Seven quick games** at the smoking room's round table (below), so two people on a break have something to do together.
- **Quick games at the round table:** rock-paper-scissors (best of 3 or 5; picks hidden until everyone picked), coin toss, dice duel, tic-tac-toe (for two, best of 3 or 5), word chain, quick math and emoji riddles (answers in English or Turkish). Each match keeps a scoreboard until someone reaches the target; "another round" starts a new match. They use the table pattern of darts, pig and guess: the server keeps the table, flips, rolls and deals, and hidden picks and answers are never sent. Table moves are limited to 90 a minute per person. Private rooms offer them too.
- **The smoking room's music in the hall and the conference hall.** The calm list (the same track at the same second as in the smoking room) plays at half the smoking room's level, with a small note "Music from the smoking room · change it there". Songs queued at the jukebox play in the smoking room only, because YouTube's player has to be visible there. The stage's sound or video, the game's mute and turning the music off on this screen silence it.
- **A much stronger swear filter.** Hundreds of forms instead of a few dozen: more English and Turkish words and stems, two-word Turkish phrases ("amına koyayım"), stars (f*ck, s**t), glued pieces (a-m-k, big-ass), look-alike letters from Cyrillic and Greek, full-width letters, invisible characters, symbols for letters ($hit, sh!t) and long runs of a letter. Words whose plain form is an everyday word (göt/got, piç/pic, sik/sıkı) only match with their Turkish letters, and an allow list keeps words like "assistant" and "cocktail".
- **Detail texts in Turkish.** Shelves, paintings, renovation notes, flaws and the topic jars have a Turkish file next to the English one, picked by the language at load (switching reloads the page); a test keeps both in the same shape.
- **On a phone, the menu folds away after a tap on one of its links**, so the panel it opens (the phone, friends, the inbox…) is never under it.

### Clubs (planned, not built)

- **Data model:** a `clubs` table in the social hub (id, name, topic, icon, owner, created_at, rules: open or by request, visibility) and `club_members` (club, user, role: owner / moderator / member, joined_at). Names and topics go through the swear filter and the same limits as room names.
- **Who creates them:** anyone who has been in the building for a while (e.g. 5 focus blocks or a week since joining), at most one or two clubs per person, so clubs are made by regulars rather than throwaway guests.
- **Membership:** open clubs are joined with a tap; others by request, accepted by the owner or a moderator. Leaving is always one tap. A member count and the badges of the club's members on its card.
- **Club rooms and events:** a club can hold a private room (the existing room sizes) that only members enter, and propose events in the calendar under the club's name (the same approval as other events). A club tag by the name, shown to friends and in the people list.
- **Moderation:** owners and moderators can remove members; admins can close a club; reports go to the existing admin inbox; the room rules (no phone, no games…) apply to club rooms as to any room.

## Round H: the stage belongs to the event's host

- **Only the host of the approved event on now may step onto the stage** (from 15 minutes before it until it ends), and admins. Everyone else can come into the conference hall, sit and listen, but the stage is closed to them like a wall: tapping it explains why, walking routes go round it, and the server refuses a move onto it (it asks the social hub again for that step, so a host whose event has just begun can go up without coming back in). A local server with no access password still lets everyone up, for testing.
- **Table game turns count on the server's clock.** Every room's welcome carries the server's time; the client keeps the difference and the turn countdown uses it, so a phone whose clock is off no longer shows a wrong or empty countdown.
