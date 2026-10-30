# Decisions

Non-obvious technical decisions, newest first.

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
