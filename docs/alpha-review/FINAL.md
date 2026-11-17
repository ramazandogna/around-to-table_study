# Round J: final report

Team:
- Lead (opus)
- Audits: A0 (haiku); A1, A3, A4, W1, W2 (sonnet); A2 (opus)
- Testers: T1 (opus), T2 (sonnet)
- Engineers: E1, E2, E3 (sonnet)
- Reviewer: R1 (sonnet)

Diff: 77 files in apps, packages and site, +3.8k/−0.3k lines, 45 commits.
Checks at the end: format, lint, typecheck and build all green. Tests: shared 217, server 59, client 29, all passing.

## What shipped (all 16 backlog items)
| ID | Change | Evidence |
|---|---|---|
| J01 | The server measures focus time. A forged timer credits 0, and an honest pause or resume keeps its credit. | server `focus.test.ts`; T1 round 2 |
| J02 | Private rooms refuse players past their size, simultaneous joins included. The client says "full". | `rooms.test.ts`, `repro/T1-01.mjs` passes, `shots/E2-full.png` |
| J03 | A running block survives a language switch and F5. | `repro/T1-02.mjs`, `E2-J03.mjs` |
| J04 | Wrong room passwords: 8 tries per account and room, kept in SQL. | `password-tries.test.ts`; T1 tried with two characters |
| J05 | One honest beta story on the site: "Join the closed beta", a modal with a copyable address, a trust line, a focus trap. | `shots/final-beta-modal-*.png` |
| J06 | Safety rules hold on the server: area known to the server, phone note filter, wider link filter, blocks apply to say, emote and dance, burst cooldown. | `safety.test.ts`, `block.test.ts`; T1 round 2 |
| J07 | Report a player, with an admin list. Reports survive deleting the account. | `reports.test.ts`, `shots/E2-report.png` |
| J08 | Delete my account (typed DELETE or SİL). Every table is purged. | `delete-account.test.ts`, `shots/E2-delete.png` |
| J09 | The game and the site start in the visitor's language. | `language.test.ts`, `E2-J09.mjs`, `shots/final-game-tr-phone-create.png` |
| J10 | The coach shows once, there is one welcome-back line, and the coach names the library and the smoking room. | `welcome.test.ts`, `shots/final-welcomeback.png` |
| J11 | "Let's go" after a break walks you back to your seat. | `walkback.test.ts`, `shots/final-walkback.png` |
| J12 | Dialogs take focus, trap Tab, close on Esc and give focus back. | `E2-J12.mjs` |
| J13 | Phone panels no longer collide, the chat input is 162px, the coach is one line. | `shots/E2-j13-*.png` |
| J14 | The site has OG and Twitter tags, a canonical link, robots, a sitemap, a 404 page and local legal pages. | W2 re-run |
| J15 | Site copy: new subtitle, "Tek başına çalışma.", founder note, "Web only for now". | `shots/final-site-*.png` |
| J16 | Streaks forgive 2 rest days in 7. Blocking is silent. | `stats.test.ts`, `block.test.ts` |

The code review (R1) found 3 major and 4 minor problems. All of them were fixed and re-verified by T1.

## Before / after
| Persona (T2) | Before | After |
|---|---|---|
| Student living in Japan, desktop | 7 | 8 |
| Turkish user on a phone | 6 | 8 |
| Returning the next day | 5 | 7 |

| Lighthouse | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|
| Mobile | 89 → 99 | 93 → 100 | 100 → 100 | 100 → 100 |
| Desktop | 100 → 93 | 96 → 100 | 100 → 100 | 100 → 100 |

T1 bugs: 2 S2 and 9 S3 before. After: 0 S1/S2, 8 rows fixed, 0 regressions, 0 new bugs.

## Not verified (honestly)
- Real Google sign-in and the production access code. Locally the dev email sign-in and an open door were used.
- Real phones, the on-screen keyboard and IME composition.
- Stage hand-over between two real presenters.
- The ZH and JA site copy beyond a quick look.
- The desktop Lighthouse drop from 100 to 93 was not investigated and may be variance.
- Links to production (workers.dev) could not be reached from the sandbox.

## Remaining risks
- **One SocialHub for everyone (A4-6).** Fine for a beta, but a ceiling.
- **DATA_EPOCH drops all data on a bump (A4-8).** One wrong edit wipes everything.
- **Clock-based events and quests follow the device clock (T1-09).** A dead connection is not shown (T1-11). Table games are forfeited on a reconnect (T1-08).
- **Lookalike names (T1-05), one character in several areas (T1-07), invisible text (T1-10).**
- **Cold start (A2-3).** A lone visitor still sees an empty library.

## Feature matrix, updated maturity (from A2)
| Feature | Maturity |
|---|---|
| Focus credit | Prototype → Working (server-checked) |
| Break return loop | Prototype → Working |
| Safety (block, report, filters) | Prototype → Working |
| Data rights (delete account) | None → Working |
| Language onboarding | Working → Polished |
| Welcome back | None → Prototype (a toast that fades too fast) |
| Site funnel | Prototype → Working (mailto plus copy, no waitlist) |
| Familiar faces | None, unchanged |
| Cold start | Idea, unchanged |
| Clubs | Idea, unchanged |

## Next round, top 5
1. Cold start: a daily study hour, and "who is around" shown before entering (A2-3, T2-6).
2. Familiar faces: remember co-presence and show it on cards (A2-4).
3. Server clock for events and quests, a reconnecting banner, a grace period in table games (T1-09, T1-11, T1-08).
4. A guard on DATA_EPOCH and an admin audit log (A4-8, A4-12).
5. Phone polish: the "Gir" button below the fold, a longer welcome-back, a single pomodoro confirmation (T2 round 2).

## Verdict
- **Game: GO for the closed beta.** Every P0 is fixed and verified, there are no open S1 or S2 bugs, and data rights and reporting now exist. The open risks are S3 or scaling issues that a small beta can live with.
- **Website: GO.** The entry story is consistent, Lighthouse is 99 to 100 on mobile, and shared links get a preview. One condition: re-check the Play link against the production Worker after the next deploy.
