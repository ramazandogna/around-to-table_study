# Around the Table 📚🪑

> **Don't study alone. Take a seat.**
> A cozy, browser-based isometric library where people study "together" in silence, take breaks in a chatty smoking room, and slowly become friends.

**Status:** 🟡 Idea / planning · No playable build yet · No code written

---

## Why?

Living in Japan, I noticed how inward-looking people have become. Most spend their time at home, alone. People around me use Bumble not to date, but **just to find friends** to have dinner with.

Around the Table is built for that need. It is not social media and not a dating app. It is about **spending time together**:

- You sit in the library. Others are studying, so you study too. No need to talk; being there is enough. This is known as *body doubling*.
- When you take a break, you go to the smoking room, just like in real life. Chat is open there.
- With people you've met, you open a small private room and meet regularly.

We want to combine the warmth of Sanalika with the quiet of a library.

## The place

```
                ┌──────────── LIBRARY (main hall) ────────────────┐
                │   ╭────────── elliptical table ─────────╮       │
                │   │ ✅ open           │ 🚧 RENOVATION 🚧 │       │
                │   ╰─────────────────────────────────────╯       │
                └───────────────────▲─────────────────────────────┘
                                    │ big double glass door
 ┌─────────────┐   ┌────────────────┴───────────────┐   ┌──────────────┐
 │SMOKING ROOM │◄──┤   ENTRANCE HALL + RECEPTION 🛎️ ├──►│  ELEVATOR 🛗 │──► Private rooms
 │ (open chat) │   │      (everyone starts here)    │   │ join / create│
 └─────────────┘   └────────────────────────────────┘   └──────────────┘
```

| Area | Rules | Text limit | Cooldown |
|---|---|---|---|
| **Library** | NO CAPS · flashy effects hidden · silent notifications · phone (DMs) not allowed | 50 chars | 60–90 s |
| **Smoking room** | Open chat · add friends · sound notifications allowed | 300 chars | anti-spam (~3 s) |
| **Private room** (elevator) | Password-protected · owner picks size and type (silent / chat / game) | 200 chars | depends on type |

At launch only the **left end** of the big elliptical table is open. The rest is taped off with a sign: *"This part of the library is under renovation and not available yet."* As the community grows, new sections open, so growth is visible inside the world itself.

## Above each character

```
        ┌──────────────────────────────────────┐
        │ feeling productive today i think     │  ← live speech bubble (temporary)
        └──────────────────────────────────────┘
        [ 📌 looking for 3 people for tue room ]  ← announcement (no ads)
        [ 📖 Reading · 1984                    ]  ← activity + short note
        [ 🌧️ Sad · i hate the rain             ]  ← mood + short note
                     ▣
                    ▣▣▣   🐈
```

## Has anyone done this before?

Yes, in pieces. No app combines "study together quietly in a library and slowly become friends".

| App | What worked | Where it falls short |
|---|---|---|
| **Sanalika**, **Habbo Hotel**, **Club Penguin** | Avatars, speech bubbles, rooms, wandering around | Not focus-oriented, noisy, monetization pressure |
| **Gather.town**, **WorkAdventure** | Top-down 2D map, proximity interaction | Built for offices and video, not for meeting strangers |
| **Study Together** (Discord), **StudyStream** | People love the "everyone is studying right now" feeling | Needs camera/voice or is just a Discord server; no sense of place |
| **Focusmate**, **Flow Club** | Body doubling works; scheduled sessions | Mandatory video is draining; friendships don't form |
| **Forest**, lofi café sites | Calm aesthetic, focus ritual | Single-player, no other people |
| **Bumble BFF** | Proves people want friends, not dates | Swiping creates pressure; no shared place |

**What we admire:** Sanalika's warmth and head bubbles, Gather's top-down map, Focusmate's body doubling, Forest's calm.

**What we keep the same:** walking around with an avatar, speech bubbles, rooms, studying while sitting together.

**What we do differently:**
- **No camera, no voice.** Just presence, short text and status lines.
- **Silence is a rule.** No caps, no effects, no spamming in the library.
- **We start small.** Only one end of the table is open, so the place never feels empty.
- **Place, not profiles.** No swiping; you meet people by sitting at the same table.
- **Breaks are social.** Chat happens in the smoking room, work happens in the library.
- **No engagement tricks.** Quiet notifications, the user stays in control.

## What's in the first release? (MVP / closed beta)

- [ ] Entrance hall, reception, library and smoking room maps
- [ ] Walk by tap/click or WASD/arrow keys (same experience on phone and desktop)
- [ ] Real-time multiplayer (everyone in the same area sees each other)
- [ ] Library rules and the renovation zone
- [ ] 3-line status + speech bubble above each head
- [ ] Sims-like but minimal, square-based character creator (head, hair, outfit, colors)
- [ ] Starter pet: cat, dog, lizard or turtle (free during beta)
- [ ] Emotes (wave, laugh, sleepy…)
- [ ] Friends and an in-game "phone" for DMs (DMs are not allowed in the library)
- [ ] Elevator: create/join password-protected rooms, get a key from reception
- [ ] Block, report, profanity filter

**Later:** shared focus timer (pomodoro), unlocking new table sections, mini games in game rooms, paid pets, more languages, a Steam version.

## How hard is it?

| Part | Difficulty | Note |
|---|---|---|
| Isometric world + movement + camera | 🟡 Medium | three.js with Kenney's CC0 3D kits |
| Responsive (phone + desktop) | 🟡 Medium | Touch controls and the on-screen keyboard take effort |
| Real-time multiplayer | 🟡 Medium | A well-understood problem at small scale (≤200 users) |
| Area rules (caps, cooldown, limits) | 🟢 Easy | Must be enforced on the server |
| Character creator | 🟡 Medium | Characters are drawn from squares in code, so no license issues |
| Friends + DMs + push notifications | 🟡 Medium | Web push on iOS requires "Add to Home Screen" |
| Moderation / safety | 🔴 Hard, never finished | Grows with the community |
| Making it look good | 🔴 Hard | No designer; we rely on free CC0 assets |

Estimate: one developer with AI assistance, 10–15 hours a week, **2–3 months to closed beta**.

## Tech (short)

TypeScript · **three.js** (isometric 3D world) · **React** (menus) · **Cloudflare Workers + Durable Objects** (real-time rooms) · **Cloudflare D1** (database) · Kenney CC0 3D assets.
Everything runs on **free tiers**. Cloudflare was chosen over Vercel because the game needs persistent WebSocket connections, which serverless functions can't hold.

## Development

Requirements: Node 24 (see `.nvmrc`) and pnpm 10.

```bash
pnpm install
pnpm build                       # build the client once
pnpm --filter @att/server dev    # Worker + game at http://localhost:8787
pnpm --filter @att/client dev    # or: Vite with hot reload at http://localhost:5173
```

Checks (all must pass before a commit): `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

| Folder | What lives there |
|---|---|
| `apps/client` | Vite + React (UI) + three.js (isometric world) |
| `apps/server` | Cloudflare Worker: API, static assets, later Durable Objects |
| `packages/shared` | Types, constants and rules shared by client and server |
| `docs/decisions.md` | Why things are the way they are |

## Follow / contribute

- ⭐ Star the repo and turn on **Watch → Releases** to hear about new versions.
- Track progress through the MVP checklist above and the GitHub *Milestones* page.
- Use *Issues* for ideas and bugs. Want to join the closed beta? Open an issue with the `beta` label.
- Can you draw pixel art? You're exactly who we're looking for. 🙏

## License

Code: MIT (planned). Assets will be listed with their licenses in `CREDITS.md`.
