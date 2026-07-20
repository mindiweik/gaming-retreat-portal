import { createRng, shuffled } from "./rng.ts";
import { conflictsWithAny } from "./overlap.ts";
import type {
  AssignmentPass,
  LotteryAssignment,
  LotteryEntry,
  LotteryGame,
  LotteryInput,
  LotteryResult,
  LotteryMetrics,
  GapReportItem,
  TableHealthItem,
  WaitlistEntry,
} from "./types.ts";

/**
 * Run a single day's lottery — the 3-pass algorithm + auto-waitlist.
 *
 * Pure & deterministic: identical (input, seed) ⇒ identical result.
 * See blueprint §6. Per-day-per-run seed for reproducible re-runs.
 */
export function runLottery(input: LotteryInput): LotteryResult {
  const { dayId, games, entries, participantUserIds, seed } = input;
  const rng = createRng(seed);

  const gameById = new Map<string, LotteryGame>();
  for (const g of games) gameById.set(g.id, g);

  const entryByUser = new Map<string, LotteryEntry>();
  for (const e of entries) entryByUser.set(e.userId, e);

  // Per-user assigned games (the LotteryGame objects, for overlap checks).
  const assignedGamesByUser = new Map<string, LotteryGame[]>();
  const filled = new Map<string, number>();
  for (const g of games) filled.set(g.id, 0);
  const assignments: LotteryAssignment[] = [];

  const openSeats = (g: LotteryGame): number => Math.max(0, g.maxSeats - (filled.get(g.id) ?? 0));
  const userGames = (userId: string): LotteryGame[] => assignedGamesByUser.get(userId) ?? [];
  const hasOpenSeat = (g: LotteryGame | undefined): g is LotteryGame => !!g && openSeats(g) > 0;

  const assign = (userId: string, gameId: string, pass: AssignmentPass, rank?: number): void => {
    const g = gameById.get(gameId);
    if (!g) return;
    assignedGamesByUser.set(userId, [...userGames(userId), g]);
    filled.set(gameId, (filled.get(gameId) ?? 0) + 1);
    const a: LotteryAssignment = { userId, gameId, pass };
    if (rank !== undefined) a.rank = rank;
    assignments.push(a);
  };

  const systemAlreadyAssigned = (game: LotteryGame, assigned: readonly LotteryGame[]): boolean =>
    assigned.some((g) => g.system === game.system);

  /**
   * Pick a backfill game for a user: prefer games below their min (table health),
   * then most open seats; deterministic tiebreak by id. Must be non-conflicting
   * and (if avoidDuplicateSystems) non-duplicate-system.
   */
  const pickBackfillGame = (userId: string, avoidDuplicateSystems: boolean): LotteryGame | undefined => {
    const assigned = userGames(userId);
    const scored = games
      .map((g) => ({ g, open: openSeats(g) }))
      .filter(({ g, open }) => {
        if (open <= 0) return false;
        if (assigned.some((x) => x.id === g.id)) return false;
        if (conflictsWithAny(g, assigned)) return false;
        if (avoidDuplicateSystems && systemAlreadyAssigned(g, assigned)) return false;
        return true;
      })
      .sort((a, b) => {
        const aBelow = (filled.get(a.g.id) ?? 0) < a.g.minSeats ? 1 : 0;
        const bBelow = (filled.get(b.g.id) ?? 0) < b.g.minSeats ? 1 : 0;
        if (bBelow !== aBelow) return bBelow - aBelow; // below-min first
        if (b.open !== a.open) return b.open - a.open; // most open seats
        return a.g.id < b.g.id ? -1 : 1; // stable tiebreak
      });
    return scored[0]?.g;
  };

  // ── PASS 1 — Guarantee (1 game/day) ──────────────────────────────────────
  // Order users by seeded shuffle; give each their top feasible, non-overlapping
  // ranked choice.
  const pass1Order = shuffled(participantUserIds, rng);
  for (const userId of pass1Order) {
    if (userGames(userId).length > 0) continue;
    const entry = entryByUser.get(userId);
    if (!entry) continue; // non-submitters handled in backfill
    for (const c of sortedChoices(entry)) {
      const g = gameById.get(c.gameId);
      if (!hasOpenSeat(g)) continue;
      if (conflictsWithAny(g, userGames(userId))) continue;
      if (entry.avoidDuplicateSystems && systemAlreadyAssigned(g, userGames(userId))) continue;
      assign(userId, c.gameId, "GUARANTEE", c.rank);
      break;
    }
  }

  // ── PASS 1 — Backfill ────────────────────────────────────────────────────
  // Anyone still at 0 games who is "open to other games" (ranked submitters with
  // the flag) gets placed into any open, non-overlapping seat. Non-submitters
  // (no entry) are treated as open-to-any and backfilled LAST.
  const unplacedRankedOpen = pass1Order.filter(
    (u) => userGames(u).length === 0 && entryByUser.has(u) && entryByUser.get(u)!.openToOtherGames,
  );
  const unplacedNonSubmitters = pass1Order.filter(
    (u) => userGames(u).length === 0 && !entryByUser.has(u),
  );
  for (const u of unplacedRankedOpen) {
    const g = pickBackfillGame(u, entryByUser.get(u)?.avoidDuplicateSystems ?? false);
    if (g) assign(u, g.id, "BACKFILL");
  }
  for (const u of unplacedNonSubmitters) {
    const g = pickBackfillGame(u, false);
    if (g) assign(u, g.id, "BACKFILL");
  }

  // ── PASS 2 — Second game (cap 2/day) ─────────────────────────────────────
  // Order by fewest games first, then seeded shuffle for the tiebreak.
  const pass2Base = shuffled(participantUserIds, rng);
  pass2Base.sort((a, b) => userGames(a).length - userGames(b).length);
  for (const userId of pass2Base) {
    const entry = entryByUser.get(userId);
    if (!entry) continue; // no rankings → can't pick a 2nd ranked game
    if (userGames(userId).length >= 2) continue; // cap
    for (const c of sortedChoices(entry)) {
      if (userGames(userId).some((g) => g.id === c.gameId)) continue; // already in
      const g = gameById.get(c.gameId);
      if (!hasOpenSeat(g)) continue;
      if (conflictsWithAny(g, userGames(userId))) continue;
      if (entry.avoidDuplicateSystems && systemAlreadyAssigned(g, userGames(userId))) continue;
      assign(userId, c.gameId, "SECOND", c.rank);
      break;
    }
  }

  // ── PASS 3 — Table health ONLY ───────────────────────────────────────────
  // Rescue games below their minimum by pulling in users who ranked them. This is
  // the ONLY pass allowed to push a user past the 2/day cap.
  const belowMinGames = games
    .filter((g) => (filled.get(g.id) ?? 0) < g.minSeats)
    .sort((a, b) => a.minSeats - b.minSeats); // rescue tighter games first
  for (const g of belowMinGames) {
    let need = g.minSeats - (filled.get(g.id) ?? 0);
    if (need <= 0) continue;
    const candidates = shuffled(participantUserIds, rng)
      .map((uid) => ({ uid, entry: entryByUser.get(uid) }))
      .filter(({ uid, entry }) => {
        if (!entry) return false;
        const ch = entry.choices.find((c) => c.gameId === g.id);
        if (!ch) return false;
        if (userGames(uid).some((x) => x.id === g.id)) return false;
        if (conflictsWithAny(g, userGames(uid))) return false;
        if (entry.avoidDuplicateSystems && systemAlreadyAssigned(g, userGames(uid))) return false;
        return true;
      })
      .sort((a, b) => {
        const ra = a.entry!.choices.find((c) => c.gameId === g.id)!.rank;
        const rb = b.entry!.choices.find((c) => c.gameId === g.id)!.rank;
        return ra - rb;
      });
    for (const { uid, entry } of candidates) {
      if (need <= 0) break;
      const rank = entry!.choices.find((c) => c.gameId === g.id)!.rank;
      assign(uid, g.id, "TABLE_HEALTH", rank);
      need--;
    }
  }

  // ── AUTO-WAITLIST ─────────────────────────────────────────────────────────
  // Every ranked game a user did NOT land → waitlist in ranked order. Conflicting
  // entries are KEPT but flagged (current default).
  const assignedGameIdsByUser = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!assignedGameIdsByUser.has(a.userId)) assignedGameIdsByUser.set(a.userId, new Set());
    assignedGameIdsByUser.get(a.userId)!.add(a.gameId);
  }
  const waitlist: WaitlistEntry[] = [];
  for (const entry of entries) {
    for (const c of sortedChoices(entry)) {
      if (assignedGameIdsByUser.get(entry.userId)?.has(c.gameId)) continue;
      const g = gameById.get(c.gameId);
      const hasConflict = g ? conflictsWithAny(g, userGames(entry.userId)) : false;
      waitlist.push({ userId: entry.userId, gameId: c.gameId, rank: c.rank, hasConflict });
    }
  }

  // ── GAP REPORT ────────────────────────────────────────────────────────────
  const gapReport: GapReportItem[] = pass1Order
    .filter((u) => userGames(u).length === 0)
    .map((u) => ({
      userId: u,
      reason: entryByUser.has(u) ? "no_feasible_choice" : "no_entry",
    }));

  // ── TABLE HEALTH ──────────────────────────────────────────────────────────
  const tableHealth: TableHealthItem[] = games.map((g) => {
    const assigned = filled.get(g.id) ?? 0;
    return {
      gameId: g.id,
      assigned,
      minSeats: g.minSeats,
      maxSeats: g.maxSeats,
      belowMin: assigned < g.minSeats,
    };
  });

  return {
    dayId,
    seed,
    assignments,
    waitlist,
    gapReport,
    tableHealth,
    metrics: computeMetrics(assignments, participantUserIds.length, tableHealth),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sortedChoices(entry: LotteryEntry): LotteryEntry["choices"] {
  return [...entry.choices].sort((a, b) => a.rank - b.rank);
}

function computeMetrics(
  assignments: LotteryAssignment[],
  participantCount: number,
  tableHealth: TableHealthItem[],
): LotteryMetrics {
  const gamesByUser = new Map<string, number>();
  for (const a of assignments) gamesByUser.set(a.userId, (gamesByUser.get(a.userId) ?? 0) + 1);

  const ranked = assignments.filter((a) => a.rank !== undefined);
  const rankSum = ranked.reduce((s, a) => s + (a.rank ?? 0), 0);

  const placed = [...gamesByUser.values()].filter((n) => n > 0).length;
  const withTwoOrMore = [...gamesByUser.values()].filter((n) => n >= 2).length;
  const unplacedCount = Math.max(0, participantCount - placed);

  return {
    avgGamesPerUser: participantCount > 0 ? assignments.length / participantCount : 0,
    avgAssignedChoiceRank: ranked.length > 0 ? rankSum / ranked.length : 0,
    placementRate: participantCount > 0 ? placed / participantCount : 0,
    secondGameRate: participantCount > 0 ? withTwoOrMore / participantCount : 0,
    unplacedCount,
    belowMinGameCount: tableHealth.filter((t) => t.belowMin).length,
  };
}
