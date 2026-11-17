# Round J backlog

Sources: A2, A3, A4, W1, W2 (audits), T1, T2 (tests). Lead decisions are marked **Lead:**.
Owners: E1 = server and shared, E2 = game client, E3 = website. "E1→E2" means E1 ships the protocol and server first, then E2 adds the UI.

## This round

### P0: crash, data loss, security hole, first-time blocker

| ID | Title | Sources | Acceptance criteria | Effort | Owner | Depends on |
|---|---|---|---|---|---|---|
| J01 | The server measures focus time | A2-1, A4-1 | The server stores when a block starts. `finished` credits the smaller of the time it measured and the planned length, and only while the player was in the library or a private room. A forged `{remainingMs:0,totalMs:3h}` followed by `finished` credits 0. Shared or server test included. | M | E1 | none |
| J02 | Private rooms keep their size | T1-01 | The server refuses a pass once the room holds `size` people (`full`), and the client shows "full" when joining by code. `repro/T1-01.mjs` exits 0. | S | E1→E2 | none |
| J03 | A running block survives a reload or a language switch | T1-02, A3-14 | Switching language does not throw the block away: either it switches live, or the timer, plan and round are kept in sessionStorage and restored after the reload. F5 restores them too, and the player is told they must sit down again. `repro/T1-02.mjs` exits 0. | M | E2 | none |
| J04 | Room passwords have a try limit | A4-2, A4-11 | Wrong room passwords are limited per account and room (for example 8 in 10 minutes), counted in SQL so the count survives eviction. Test included. **Lead:** the hash change (PBKDF2) waits for the next round, because changing it now would break existing rooms. | S | E1 | none |
| J05 | The site tells one honest story about getting in | W1-1, W1-2, W1-3, W1-7, W2-1, W2-2, T2-3, T1-14 | The CTA reads "Join the closed beta" (EN/TR/ZH/JA). Plain hrefs point at `#beta`, so no click lands cold at the door. The steps say Google sign-in plus this week's code. Asking for a code shows the address with a copy button next to the mailto. One trust line: free, no ads, what is kept (checked against privacy.html). The modal traps focus and closes on Esc. | M | E3 | none |

### P1: core loop, reasons to return, site conversion (6)

| ID | Title | Sources | Acceptance criteria | Effort | Owner | Depends on |
|---|---|---|---|---|---|---|
| J06 | The server enforces safety rules everywhere | T1-06, T1-03, T1-04, A4-5 | The social socket uses the area the server knows the player is in, not the one the client claims (a library player cannot shout). The phone note goes through the status-line filter (40 chars, no links, no swearing). The link filter catches any `word.tld` and fullwidth dots. Area say, emotes and dances are not delivered to someone who blocked the sender. Tests for each. | M | E1 | none |
| J07 | Report a player | A4-3 | The player card has a "Report" action with a reason. The server stores reporter, target, a text snapshot (the last lines from the target), area and time. Admins see the reports in the existing admin view. Rate-limited. EN/TR. | M | E1→E2 | none |
| J08 | Delete my account | A4-4 | A "Delete account" action with a typed confirmation removes the account, its characters, DMs, friendships, blocks, focus blocks, sessions and Google identity. Then sign-out happens. A test proves nothing is left behind. EN/TR. | M | E1→E2 | none |
| J09 | The game starts in the visitor's language | T2-1, W2-10 | On a first visit the game picks TR when `navigator.language` starts with `tr`, or when the site passes `?lang=tr`. The site sends `lang` on its play links, and itself reads `navigator.language` on first visit. A saved choice still wins. | S | E2 + E3 | none |
| J10 | A welcome back, and one welcome only | T2-2, A3-9, A3-10 | The first-visit coach shows once per account. A returning player gets one short line ("Welcome back · 25m yesterday · streak N"). The coach names the library and the smoking room. Intro and coach no longer show back to back. EN/TR. | S | E2 | none |
| J11 | A break brings you back to the desk | A2-2 | At the end of a break, "Let's go" walks the player back to their last seat. The next work block starts when they sit, not where they stand. If the seat is taken, they are sent to the library door with a note. | M | E2 | J03 |

### P2: polish (5)

| ID | Title | Sources | Acceptance criteria | Effort | Owner | Depends on |
|---|---|---|---|---|---|---|
| J12 | Dialogs behave like dialogs | A3-1, A3-2 | Every panel focuses its first control, traps Tab, closes on Esc (Friends, Phone and Goals included) and gives focus back on close, through one shared hook. | S | E2 | none |
| J13 | Phone panels stop colliding | A3-3, A3-4, A3-5, A3-7, T2-5 | While a panel is open, the room-chat toggle hides and the menu closes. The chat input is at least 160px at 390px width, with a short placeholder. The coach card is one line and never covers the joystick. Checked with screenshots at 390px. | S | E2 | J10 |
| J14 | The site can be shared and found | W2-3, W2-5, W2-6, W2-7, W2-11 | Absolute og:image plus og:url, og:type, twitter:card and canonical. robots.txt, sitemap.xml and 404.html. The Play buttons have aria-labels, and there is no prohibited ARIA on the badges. Terms and privacy are copied into the site. | S | E3 | none |
| J15 | Site copy polish | W1-4, W1-5, W1-10, W1-13, W1-14, T2-8 | The hero subtitle names quiet study beside real people. TR "Tek başına çalışma." "Evcil hayvanlar" is used everywhere. A two-sentence founder note. Store badges replaced by "Web only for now". | S | E3 | J05 |
| J16 | Gentle streaks, silent blocks | A2-6, A4-7 | The streak survives up to two missed days in a 7-day window. Blocking no longer notifies the blocked person. Tests for both. | S | E1 (block), E2 (streak) | none |

## Next round (P3)
- Cold start: a daily study hour, and showing who is around before entering (A2-3, T2-6, A2-9).
- Familiar faces and co-presence memory (A2-4). Clubs grow from it (A2-11).
- Badges that reward volume (A2-5), daily tasks that sometimes skip study (A2-7), library strips that never close (A2-8), staff acknowledging players (A2-10).
- Hardening:
  - Token max age and WS Origin check (A4-9, A4-10).
  - Admin audit log, shout removal and ban (A4-12, A4-14).
  - Social hub caching (A4-6), DATA_EPOCH guard (A4-8), attachment size (A4-13).
  - PBKDF2 room hash.
- Server clock for events, quests and timers (T1-09). Dead-connection banner (T1-11). Grace period on a table-game reconnect (T1-08). One character in several rooms (T1-07). Case-folded unique names (T1-05). Invisible and bidi text (T1-10). Darts aim on the server (T1-12). Overlapping conference events (T1, unconfirmed).
- HUD "More" menu (A3-11). Touch targets and contrast (A3-8, A3-12, A3-13, A3-15, A3-16). Pomodoro double confirm (T2-4). Tappable door signs (T2-7).
- Site: performance and TBT, vue-router removal (W2-8). hreflang routes (W2-10).

## Rejected or deferred
- **Renaming the "smoking room" (W1-6).** Settled in the decisions, so it is not reopened. Recorded as a Decision proposal for the owner.
- **A waitlist form with a backend (W2-2 variant).** The site is static Pages, and a form needs a store. The copy button is the static fix for now.
