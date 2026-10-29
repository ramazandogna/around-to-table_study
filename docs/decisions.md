# Decisions

Non-obvious technical decisions, newest first.

## 2026-10-29: Multiplayer on plain Durable Objects
- **Decision:** One `AreaRoom` Durable Object per area, using the WebSocket Hibernation API directly instead of `partyserver`. The client uses `partysocket`'s `ReconnectingWebSocket`.
- **Why:** The server side is ~200 lines without the extra framework, and hibernation is the part that keeps us on the free plan. Per-connection state lives in the socket attachment so it survives hibernation.
- **Movement:** clients send only a target tile. The server checks reachability with the shared A* and broadcasts the target; every client walks remote players there with the same pathfinding. A rejected move gets a `placed` reply that snaps the player back.
- **Reconnects:** the server places a returning player at the door they came through; the client then walks to where it actually is.

## 2026-10-29: Guest sessions are HMAC-signed tokens
- **Decision:** `POST /api/guest` returns `payload.signature` (HMAC-SHA256 with `SESSION_SECRET`). The token is stored in localStorage and sent when opening an area socket. Guest tokens do not expire yet.
- **Why:** No database is needed for Phase 2, and nobody can join as someone else. Expiry and revocation come with real accounts in Phase 5.

## 2026-10-29: Characters from Kenney Roguelike Characters
- **Decision:** Characters are composited from Kenney layers (body, pants, shoes, top, beard, hair). `Appearance` stores indices into `CHARACTER_PARTS`, so the server validates looks by range. The pack only has front-facing sprites, so walking is a small hop and left/right is a horizontal flip.

## 2026-10-29: Top-down pixel view with Kenney Roguelike tiles
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
