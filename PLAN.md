# "It's a Gift" — LOTR Secret Santa

> *"It's a gift. A gift to the foes of Mordor."* — Boromir

## 1. Plan (v1)

**Goal:** a small website where friends create a Secret Santa event, join it,
and each person anonymously draws whose gift they buy.

**Flow**
1. Organizer creates a "Fellowship" (event name, budget, exchange date, own name).
2. Organizer gets an **invite link** to share with friends.
3. Friends open the invite link, enter their name + wishlist, and join.
4. Organizer presses **"Cast lots"**, which runs the draw.
5. Each person opens their page and reveals their recipient. Theme: the ring, plus "It's a gift".

**Tech**
- Node.js `http` server, server-rendered HTML, vanilla CSS/JS.
- SQLite storage.
- Draw = random permutation where nobody draws themselves.

## 2. Revision of v1: problems found and fixes

| # | Problem in v1 | Fix |
|---|---------------|-----|
| 1 | No accounts, so how does a friend get back to their page later? | Every participant gets a secret **personal link** (random 128-bit token). It is shown after joining and also kept in `localStorage`, so the invite page can say "welcome back". |
| 2 | How does the organizer manage things without a login? | Separate secret **admin link**. Whoever holds it can manage the event. |
| 3 | Couples or flatmates often don't want to draw each other. | **Exclusions**: the organizer can mark pairs who must not draw each other (in either direction). |
| 4 | A naive "shuffle until valid" approach can loop forever when exclusions make a draw impossible. | Rejection sampling (gives a uniformly random result) for up to N tries, then a fallback to **bipartite matching** (Kuhn's algorithm on shuffled order). It always finds a valid draw if one exists, and otherwise reports a clear error. |
| 5 | People joining after the draw would break it. | Once the draw happens the event is **locked**: no joining, no removals, no exclusion changes. The organizer can **reset the draw** if really needed. |
| 6 | Wishlists change after the draw. | Participants can edit their wishlist at any time, and their Santa always sees the current version. |
| 7 | Fewer than 3 people makes no sense. | The draw requires at least 3 participants. |
| 8 | The organizer could peek at the full mapping. | The admin page never shows who drew whom. The admin can copy each person's personal link so lost links can be resent; this is a known, documented trade-off for a friends-only app. |
| 9 | Security of user input. | All output is HTML-escaped, input lengths are capped, request bodies are size-limited, and duplicate names in one event are rejected. |
| 10 | Copyrighted movie stills or memes. | No movie images. The ring, the glowing inscription and the parchment look are drawn with SVG/CSS, and the quotes are short. |
| 11 | Dependencies and setup pain. | **Zero npm dependencies**: `node:http`, `node:sqlite` and `node:test`. `npm start` is all it takes. |

## Final feature list

- Create a Fellowship (name, budget, date, organizer joins automatically)
- Invite link for joining with a name and wishlist
- Personal secret link per participant
- Admin panel: participant list, remove participant, exclusions, cast lots, reset draw
- Draw algorithm with exclusions and impossibility detection
- Reveal page with ring animation, "It's a gift!" and the recipient's live wishlist
- LOTR-themed UI (parchment, Cinzel-like serif, glowing ring inscription)
- Tests: draw algorithm (unit) and full HTTP flow (integration)

## Structure

```
server.js          entry point (PORT, DB_PATH env vars)
src/app.js         router + handlers
src/db.js          SQLite schema + queries
src/draw.js        Secret Santa assignment algorithm
src/views.js       HTML templates (escaped)
public/style.css   theme
public/app.js      copy buttons, localStorage, reveal animation
test/*.test.js     node:test suites
```
