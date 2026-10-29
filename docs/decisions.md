# Decisions

Non-obvious technical decisions, newest first.

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
