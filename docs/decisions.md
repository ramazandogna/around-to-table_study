# Decisions

Non-obvious technical decisions, newest first.

## 2026-10-29: Top-down pixel view, placeholder art drawn in code
- **Decision:** Stay with a top-down pixel view. The Kenney "Isometric Miniature Library" pack is not used: it is isometric, rendered (not pixel art) and has no floors, walls or characters. Until a matching top-down tileset is chosen, areas are ASCII layouts in `packages/shared/src/world/areas.ts` drawn with flat colors.
- **Why:** Matches the square characters, stays crisp on phones, and keeps pathfinding simple. The layouts live in `shared` so the server can validate movement against the same collision data in Phase 2.

## 2026-10-29: Grid movement with 4-directional A*
- **Decision:** Characters move tile by tile. Tapping runs A* in `shared`; tapping a blocked tile walks next to it. Renovation zones and the elevator are blocked with an explanation bubble.
- **Why:** Tile targets are what the server will receive in Phase 2, which keeps network traffic within the free tier.

## 2026-10-29: Monorepo layout and single Worker deploy
- **Decision:** pnpm workspaces with `apps/client` (Vite + React + Phaser), `apps/server` (Cloudflare Worker) and `packages/shared`. The Worker serves the client build as static assets and handles `/api/*` itself.
- **Why:** one deploy, one URL, shared TypeScript types, and everything stays on the Cloudflare free plan.

## 2026-10-29: `@att/shared` is consumed as TypeScript source
- **Decision:** `packages/shared` exports `src/index.ts` directly; there is no separate build output.
- **Why:** both Vite and Wrangler bundle TypeScript, so a build step for shared code would only add friction.
