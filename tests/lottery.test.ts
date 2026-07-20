import { test, expect } from "bun:test";
import { runLottery } from "../src/lottery/lottery.ts";
import { intervalsOverlap } from "../src/lottery/overlap.ts";
import { createRng, shuffled } from "../src/lottery/rng.ts";
import type { LotteryGame, LotteryInput, LotteryEntry } from "../src/lottery/types.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0;
const uid = (p: string) => `${p}${idCounter++}`;

function game(over: Partial<LotteryGame> = {}): LotteryGame {
  return {
    id: over.id ?? uid("g"),
    title: over.title ?? "Game",
    system: over.system ?? "system-A",
    startTime: over.startTime ?? 0,
    endTime: over.endTime ?? 120,
    minSeats: over.minSeats ?? 1,
    maxSeats: over.maxSeats ?? 4,
  };
}

function entry(userId: string, gameIds: string[], over: Partial<LotteryEntry> = {}): LotteryEntry {
  return {
    userId,
    openToOtherGames: over.openToOtherGames ?? false,
    avoidDuplicateSystems: over.avoidDuplicateSystems ?? false,
    choices: gameIds.map((gameId, i) => ({ gameId, rank: i + 1 })),
  };
}

function run(input: LotteryInput) {
  return runLottery(input);
}

// ── overlap ──────────────────────────────────────────────────────────────────

test("intervalsOverlap: touching endpoints do not conflict", () => {
  expect(intervalsOverlap(0, 120, 120, 240)).toBe(false);
  expect(intervalsOverlap(0, 120, 60, 240)).toBe(true);
  expect(intervalsOverlap(0, 120, 0, 120)).toBe(true);
});

// ── RNG determinism ──────────────────────────────────────────────────────────

test("createRng is deterministic for the same seed", () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  expect(seqA).toEqual(seqB);
});

test("shuffled is deterministic and preserves elements", () => {
  const rng = createRng(7);
  const out = shuffled([1, 2, 3, 4, 5], rng);
  expect([...out].sort()).toEqual([1, 2, 3, 4, 5]); // copy before sort
  expect(shuffled([1, 2, 3, 4, 5], createRng(7))).toEqual(out);
});

// ── Pass 1: guarantee ─────────────────────────────────────────────────────────

test("every participant gets ≥1 game when seats suffice (guarantee)", () => {
  const games = [game({ id: "g1", maxSeats: 5 }), game({ id: "g2", maxSeats: 5 })];
  const entries = ["u1", "u2", "u3"].map((u) => entry(u, ["g1"]));
  const res = run({
    dayId: "d",
    games,
    entries,
    participantUserIds: ["u1", "u2", "u3"],
    seed: 1,
  });
  const counts = new Map<string, number>();
  for (const a of res.assignments) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
  for (const u of ["u1", "u2", "u3"]) expect(counts.get(u) ?? 0).toBeGreaterThanOrEqual(1);
  expect(res.metrics.placementRate).toBe(1);
});

test("non-submitter is backfilled after ranked placements (no priority)", () => {
  // One seat left in g1; a ranked submitter and a non-submitter both want it.
  const games = [game({ id: "g1", maxSeats: 1 })];
  const entries = [entry("submitter", ["g1"])];
  const res = run({
    dayId: "d",
    games,
    entries,
    participantUserIds: ["submitter", "noentry"],
    seed: 3,
  });
  // Submitter (ranked) should win the seat; non-submitter left unplaced.
  const got = res.assignments.find((a) => a.userId === "submitter");
  expect(got?.gameId).toBe("g1");
  expect(res.gapReport.map((g) => g.userId)).toContain("noentry");
});

// ── Capacity shortfall → gap report ───────────────────────────────────────────

test("capacity shortfall produces a gap report instead of overbooking", () => {
  const games = [game({ id: "g1", maxSeats: 1, startTime: 0, endTime: 100 })];
  const entries = ["u1", "u2"].map((u) => entry(u, ["g1"]));
  const res = run({
    dayId: "d",
    games,
    entries,
    participantUserIds: ["u1", "u2"],
    seed: 9,
  });
  expect(res.assignments.length).toBe(1); // never exceed maxSeats
  expect(res.gapReport.length).toBe(1);
  expect(res.metrics.unplacedCount).toBe(1);
});

// ── Conflict = time overlap ───────────────────────────────────────────────────

test("a user is never assigned two overlapping games", () => {
  const games = [
    game({ id: "g1", startTime: 0, endTime: 120, maxSeats: 5 }),
    game({ id: "g2", startTime: 60, endTime: 180, maxSeats: 5 }), // overlaps g1
    game({ id: "g3", startTime: 200, endTime: 300, maxSeats: 5 }), // no overlap
  ];
  const entries = [entry("u1", ["g1", "g2", "g3"])];
  const res = run({
    dayId: "d",
    games,
    entries,
    participantUserIds: ["u1"],
    seed: 1,
  });
  const got = res.assignments.filter((a) => a.userId === "u1").map((a) => a.gameId);
  // g1 (rank 1) and g3 (rank 3, no conflict) — g2 (rank 2) conflicts with g1.
  expect(got).toContain("g1");
  expect(got).toContain("g3");
  expect(got).not.toContain("g2");
});

// ── Pass 2: cap 2/day ─────────────────────────────────────────────────────────

test("no user exceeds 2 games except via table-health rescue", () => {
  // All games at/above min after passes 1–2 → Pass 3 must not fire → cap holds at 2.
  const games = [
    game({ id: "g1", startTime: 0, endTime: 100, maxSeats: 5, minSeats: 1 }),
    game({ id: "g2", startTime: 200, endTime: 300, maxSeats: 5, minSeats: 1 }),
    game({ id: "g3", startTime: 400, endTime: 500, maxSeats: 5, minSeats: 0 }),
  ];
  const entries = [entry("u1", ["g1", "g2", "g3"])];
  const res = run({
    dayId: "d",
    games,
    entries,
    participantUserIds: ["u1"],
    seed: 1,
  });
  const count = res.assignments.filter((a) => a.userId === "u1").length;
  expect(count).toBe(2); // cap enforced; g3 minSeats 0 → not below min → no rescue
  expect(res.assignments.some((a) => a.pass === "TABLE_HEALTH")).toBe(false);
});

// ── Pass 3: table health may push past cap ────────────────────────────────────

test("table-health rescue can push a user to a 3rd game to reach minSeats", () => {
  // g3 needs minSeats=2. u2 ranks only g3 (gets it in Pass 1). u1 ranks g1,g2,g3
  // and already has g1+g2 (2 games) when Pass 3 rescues g3 by pulling u1 in.
  const games = [
    game({ id: "g1", startTime: 0, endTime: 100, maxSeats: 5, minSeats: 1 }),
    game({ id: "g2", startTime: 200, endTime: 300, maxSeats: 5, minSeats: 1 }),
    game({ id: "g3", startTime: 400, endTime: 500, maxSeats: 5, minSeats: 2 }),
  ];
  const entries = [
    entry("u1", ["g1", "g2", "g3"]),
    entry("u2", ["g3"]),
  ];
  const res = run({
    dayId: "d",
    games,
    entries,
    participantUserIds: ["u1", "u2"],
    seed: 1,
  });
  const u1Assigns = res.assignments.filter((a) => a.userId === "u1");
  expect(u1Assigns.length).toBe(3); // g1 + g2 + g3 (rescue past cap)
  expect(u1Assigns.some((a) => a.pass === "TABLE_HEALTH" && a.gameId === "g3")).toBe(true);
  const g3 = res.tableHealth.find((t) => t.gameId === "g3");
  expect(g3?.assigned).toBeGreaterThanOrEqual(2); // minSeats met via rescue
  expect(g3?.belowMin).toBe(false);
});

// ── avoidDuplicateSystems ──────────────────────────────────────────────────────

test("avoidDuplicateSystems skips a 2nd game with the same system", () => {
  const games = [
    game({ id: "g1", system: "CoC", startTime: 0, endTime: 100, maxSeats: 5 }),
    game({ id: "g2", system: "CoC", startTime: 200, endTime: 300, maxSeats: 5 }), // same system, no time conflict
    game({ id: "g3", system: "D&D", startTime: 400, endTime: 500, maxSeats: 5 }),
  ];
  const entries = [entry("u1", ["g1", "g2", "g3"], { avoidDuplicateSystems: true })];
  const res = run({
    dayId: "d",
    games,
    entries,
    participantUserIds: ["u1"],
    seed: 1,
  });
  const got = res.assignments.filter((a) => a.userId === "u1").map((a) => a.gameId);
  expect(got).toContain("g1");
  expect(got).not.toContain("g2"); // skipped: same system as g1
  expect(got).toContain("g3"); // different system, allowed
});

// ── Auto-waitlist ──────────────────────────────────────────────────────────────

test("unlanded ranked choices become waitlist entries, conflict-flagged when overlapping", () => {
  const games = [
    game({ id: "g1", startTime: 0, endTime: 120, maxSeats: 1 }),
    game({ id: "g2", startTime: 60, endTime: 180, maxSeats: 1 }), // overlaps g1
  ];
  // Two users both rank g1 first then g2. Only one gets g1; the other is waitlisted on both.
  const entries = [entry("u1", ["g1", "g2"]), entry("u2", ["g1", "g2"])];
  const res = run({
    dayId: "d",
    games,
    entries,
    participantUserIds: ["u1", "u2"],
    seed: 5,
  });
  // One user placed in g1, the other in g2 (no conflict between users since different games).
  expect(res.assignments.length).toBe(2);
  // The user who got g1 should be waitlisted on g2 with a conflict flag (g1 overlaps g2).
  const g1Holder = res.assignments.find((a) => a.gameId === "g1")!.userId;
  const wl = res.waitlist.find((w) => w.userId === g1Holder && w.gameId === "g2");
  expect(wl).toBeDefined();
  expect(wl?.hasConflict).toBe(true);
});

// ── Seed determinism ───────────────────────────────────────────────────────────

test("identical input + seed ⇒ identical result (reproducibility)", () => {
  const games = [
    game({ id: "g1", startTime: 0, endTime: 100, maxSeats: 2 }),
    game({ id: "g2", startTime: 200, endTime: 300, maxSeats: 2 }),
  ];
  const entries = ["u1", "u2", "u3", "u4"].map((u) => entry(u, ["g1", "g2"]));
  const input: LotteryInput = {
    dayId: "d",
    games,
    entries,
    participantUserIds: ["u1", "u2", "u3", "u4"],
    seed: 99,
  };
  const r1 = run(input);
  const r2 = run(input);
  expect(r1.assignments).toEqual(r2.assignments);
  expect(r1.waitlist).toEqual(r2.waitlist);
});

test("different seeds can produce different orderings", () => {
  const games = [game({ id: "g1", maxSeats: 1, startTime: 0, endTime: 100 })];
  const entries = ["u1", "u2"].map((u) => entry(u, ["g1"]));
  const mk = (seed: number) =>
    run({ dayId: "d", games, entries, participantUserIds: ["u1", "u2"], seed });
  // With one seat and two equal-priority users, at least one of several seeds
  // should place a different user (probabilistically near-certain across seeds).
  const winners = new Set<number>();
  for (let s = 1; s <= 20; s++) {
    const a = mk(s).assignments[0];
    if (a) winners.add(a.userId === "u1" ? 0 : 1);
  }
  expect(winners.size).toBeGreaterThan(1);
});
