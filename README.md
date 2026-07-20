# Gaming Retreat Portal

Web portal for managing a multi-day tabletop gaming retreat: profiles, game
catalog, per-day ranked-choice lottery, attendee-led game signups, tiered
waitlists, and a calendar-first UX. Scales to ~150 attendees.

> **Status:** Next.js scaffold + infrastructure foundation in progress. The pure
> lottery module is implemented and tested. Full design and implementation plans
> live in the private `marvin` notes repo.

## Stack (confirmed)

Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · PostgreSQL (Neon) ·
Drizzle · Zod · Vercel (Hobby) · hand-rolled Discord OAuth · GitHub Actions cron.
~$0 through MVP. Target: retreat June 2027.

## Local development

```bash
bun install
cp .env.example .env.local
bun run dev
```

The landing page builds and runs without external accounts. Real Discord login
requires Neon and Discord credentials; `/api/auth/dev` provides a local-only
session shortcut once `SESSION_SECRET` and `DEV_AUTO_LOGIN_DISCORD_ID` are set.
The dev route returns 404 in production.

Database commands:

```bash
bun run db:generate   # generate migrations from src/db/schema.ts
bun run db:migrate    # apply migrations (requires DATABASE_URL)
bun run db:studio     # inspect data (requires DATABASE_URL)
```

Never commit `.env.local`; `.env.example` contains safe placeholders only.

## Lottery module (`src/lottery/`)

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

### The 1.6 quality goal

The target is an **average assigned choice rank of 1.6 or better**: across ranked
assignments, attendees should receive roughly their 1.6th choice on average.
Lower is better.

This is an optimization goal and admin review metric—not a lottery validity
requirement. A draft above 1.6 remains valid and can be reviewed, rerun with a
new seed, manually adjusted, or published. The simulation also reports average
games per attendee as a separate capacity/fairness metric.

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
