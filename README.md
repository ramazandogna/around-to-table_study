# Around the Table 📚🪑

> **Don't study alone. Take a seat.**
> A cozy isometric building in your browser where people study side by side in a quiet library, take their breaks in a chatty smoking room, and slowly become friends.

**🌐 Website:** [ramazandogna.github.io/around-to-table_study](https://ramazandogna.github.io/around-to-table_study/) · **🎮 Game:** [around-the-table.ramazandogna.workers.dev](https://around-the-table.ramazandogna.workers.dev/)

**Status:** 🟠 Closed beta. Sign in with Google, then enter this week's access code (it changes with every update). Want a code? Write to [doganrmzn40@gmail.com](mailto:doganrmzn40@gmail.com).

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
                ┌──────────────────── LIBRARY ─────────────────────┐
                │  tables for four and desks for two · stacks      │
                │  ✅ open part          │  🚧 opens as it fills 🚧  │
                └───────────────────────▲──────────────────────────┘
                                        │ glass doors
 ┌──────────────┐   ┌───────────────────┴──────────────┐   ┌──────────────┐
 │ SMOKING ROOM │◄──┤  ENTRANCE HALL + RECEPTION 🛎️    ├──►│  ELEVATOR 🛗 │──► Private rooms
 │ games, music │   │      (everyone starts here)      │   │ for 3, 5, 9  │
 └──────────────┘   └───────────────────┬──────────────┘   └──────────────┘
                                        │
                          ┌─────────────┴─────────────┐
                          │ CONFERENCE HALL 🎤        │
                          │ stage + big shared screen │
                          └───────────────────────────┘
```

| Area | Rules | Text limit | Cooldown |
|---|---|---|---|
| **Library** | NO CAPS · flashy effects hidden · silent notifications · phone (DMs) not allowed | 50 chars | 60–90 s |
| **Smoking room** | Open chat · add friends · sound notifications allowed | 300 chars | anti-spam (~3 s) |
| **Private room** (elevator) | Password-protected · owner picks size and type (silent / chat / game) | 200 chars | depends on type |
| **Conference hall** | Everyone may listen; only the host of the approved event on now goes on stage and runs the big screen | 300 chars | anti-spam |

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

## What's in it now

- **Accounts:** sign in with Google; up to two characters per account, with their progress kept on the server so they follow you to any device. One account is in the building once, wherever it is open.
- **The closed beta's door:** this week's access code, separate from the account; every update changes it and sends everyone back to the door.
- **The world:** entrance hall with reception, the library, the smoking room, private rooms (3, 5 or 9 people) and the conference hall, with day and night on your own clock and staff working in shifts (the night librarian keeps dozing off, and the librarian mops now and then).
- **Studying:** pomodoro, deep focus, marathon or your own rhythm at a desk; others see your progress; a daily goal, today's goals and a quests list by the map.
- **Being together:** speech bubbles, status lines, emotes, dances, friends, a phone for messages, a building chat, a shared calendar with community events.
- **Breaks:** darts, dice, higher-or-lower and seven quick games (rock-paper-scissors, coin toss, dice duel, tic-tac-toe, word chain, quick math, emoji riddles), scores kept until someone wins; a jukebox and calm music.
- **For when you are not studying:** three small tasks a day, and paintings and books with stories to collect.
- **Pets:** a cat, four dogs, a rabbit and a turtle, each with its own ways.
- **Safety:** a strong English and Turkish swear filter, mute and block, room owners can send people out, admins approve events.
- **Languages:** English and Turkish.

## Tech (short)


TypeScript · **three.js** (isometric 3D world) · **React** (menus) · **Cloudflare Workers + Durable Objects** with SQLite storage (real-time rooms, accounts, friends) · **Google sign-in** (OAuth 2.0 + PKCE) · **Vue** (the website) · Kenney CC0 3D assets.
Everything runs on **free tiers**. Cloudflare was chosen over Vercel because the game needs persistent WebSocket connections, which serverless functions can't hold.

## Development

Requirements: Node 24 (see `.nvmrc`) and pnpm 10.

```bash
pnpm install
pnpm build                       # build the client once
pnpm --filter @att/server dev    # Worker + game at http://localhost:8787
pnpm --filter @att/client dev    # or: Vite with hot reload at http://localhost:5173
```

Local settings go in `apps/server/.dev.vars` (never committed): `SESSION_SECRET` (32+ characters), and optionally `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`, `ACCESS_PASSWORD`. Without a Google client, a local server offers a test sign-in by email instead.

Deploy from the repository root with `pnpm run deploy` (not `pnpm deploy`, which is pnpm's own command): it builds, uploads the Worker with a new access code and prints the code under the Worker's address.

Checks (all must pass before a commit): `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

| Folder | What lives there |
|---|---|
| `apps/client` | Vite + React (UI) + three.js (isometric world) |
| `apps/server` | Cloudflare Worker: API, Google sign-in, static assets, Durable Objects |
| `site` | The website (Vue), published to GitHub Pages |
| `packages/shared` | Types, constants and rules shared by client and server |
| `docs/decisions.md` | Why things are the way they are |
| `docs/lessons.md` | What building it taught us, as rules for what comes next |

## Follow / contribute

- ⭐ Star the repo and turn on **Watch → Releases** to hear about new versions.
- Use *Issues* for ideas and bugs. Want to join the closed beta? Write to [doganrmzn40@gmail.com](mailto:doganrmzn40@gmail.com) or open an issue with the `beta` label.
- Can you draw pixel art? You're exactly who we're looking for. 🙏

## License

Code: MIT (planned). Assets will be listed with their licenses in `CREDITS.md`.
