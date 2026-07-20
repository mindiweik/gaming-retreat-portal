# Gaming Retreat Portal

Web portal for managing a multi-day tabletop gaming retreat: profiles, game
catalog, per-day ranked-choice lottery, attendee-led game signups, tiered
waitlists, and a calendar-first UX. Scales to ~150 attendees.

> **Status:** Phase 2 (lottery critical path) in progress. Full design blueprint
> lives in `content/gaming-retreat-portal-plan.md` (in the `marvin` notes repo);
> implementation plan in `content/gaming-retreat-portal-implementation-plan.md`.

## Stack (confirmed)

Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · PostgreSQL (Neon) ·
Drizzle · Zod · Vercel (Hobby) · hand-rolled Discord OAuth · GitHub Actions cron.
~$0 through MVP. Target: retreat June 2027.

## Current: Lottery module (`src/lottery/`)

The heart of the system — a pure, deterministic, fully-tested per-day lottery.
No DB, no I/O; the UI (Phase 3) builds against the frozen contract in
[`types.ts`](src/lottery/types.ts).

### Algorithm (blueprint §6)

Run independently per core day, as a pure function with a stored **per-day-per-run
seed** for reproducible re-runs:

1. **Pass 1 — Guarantee:** seeded shuffle; each user gets their top feasible,
   non-overlapping ranked choice. **Backfill:** open-to-other users (and
   non-submitters, last, as open-to-any) placed into any open non-overlapping seat.
2. **Pass 2 — Second game (cap 2/day):** fewest-games-first, then seed.
3. **Pass 3 — Table health only:** rescue below-min games from users who ranked
   them; the only pass that may push a user past the cap.
4. **Auto-waitlist:** every unlanded ranked choice → waitlist (ranked order),
   conflict-flagged when overlapping an assigned game (kept, not suppressed).

Conflicts = strict time-interval overlap (touching endpoints are compatible).

### Run

```bash
bun install
bun test                 # all unit + sim tests
bun run src/lottery/cli.ts        # 150-attendee simulation, default seed
bun run src/lottery/cli.ts 999    # different seed
```

### The "1.6 benchmark" (open question — needs your call)

The blueprint says "average assigned choice per day (target ≤ 1.6)" but it's
ambiguous. The sim reports **both** readings:

| Reading | Meaning | 150-attendee sim (seed 12345) |
|---|---|---|
| `avgGamesPerUser` | avg # games assigned per user (count) | **1.547 ✅** |
| `avgAssignedChoiceRank` | avg rank of assigned choices (quality) | 1.829 ⚠️ |

With a 1.6 seat-to-user ratio, `avgGamesPerUser` tracks the ratio and lands ≤ 1.6
— strong evidence the benchmark is the **count** reading. **Confirm before
treating either as a hard gate.**

## Project layout

```
src/lottery/
  types.ts      # frozen input/output contract
  rng.ts        # seedable mulberry32 + deterministic shuffle
  overlap.ts    # time-interval conflict helpers
  lottery.ts    # the 3-pass algorithm + auto-waitlist + metrics
  simulate.ts   # 150-attendee simulation harness
  cli.ts        # run the sim from the command line
  index.ts      # barrel
tests/
  lottery.test.ts    # edge-case unit tests
  simulate.test.ts   # benchmark / determinism tests
```

## Next phases

See the implementation plan. After the lottery contract is confirmed, Phase 0
scaffolds the Next.js app around this module.
