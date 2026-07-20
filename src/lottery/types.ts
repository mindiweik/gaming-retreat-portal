/**
 * Lottery input/output contract.
 *
 * This is the frozen interface the UI (Phase 3) will build against. The lottery
 * is a PURE, deterministic function of its inputs + seed — no DB, no I/O.
 *
 * Convention: times are `number` in minutes-from-midnight (same-day games). The
 * app layer converts its free-form times to this unit before calling.
 */

/** A single scheduled game on a core day, as seen by the lottery. */
export interface LotteryGame {
  id: string;
  title: string;
  system: string;
  startTime: number; // minutes from midnight
  endTime: number; // minutes from midnight
  minSeats: number;
  maxSeats: number;
}

/** One ranked choice within an entry. */
export interface LotteryChoice {
  gameId: string;
  rank: number; // 1 = top choice
}

/** A user's ranked submission for a single core day. */
export interface LotteryEntry {
  userId: string;
  openToOtherGames: boolean;
  avoidDuplicateSystems: boolean;
  choices: LotteryChoice[]; // ranked; sorted by rank ascending is expected
}

/** Input to a single day's lottery run. */
export interface LotteryInput {
  dayId: string;
  games: LotteryGame[];
  /** Ranked entries for this day (submitters). */
  entries: LotteryEntry[];
  /** Every user who should receive the one-per-day guarantee (submitters + non-submitters). */
  participantUserIds: string[];
  /** Per-day-per-run seed. Same seed + same input ⇒ identical result. */
  seed: number;
}

/** Which pass produced an assignment. */
export type AssignmentPass =
  | "GUARANTEE" // Pass 1: top feasible ranked choice
  | "BACKFILL" // Pass 1 backfill: open-to-other / non-submitter, unranked
  | "SECOND" // Pass 2: second ranked game (cap 2/day)
  | "TABLE_HEALTH"; // Pass 3: rescue below-min game (may exceed cap)

export interface LotteryAssignment {
  userId: string;
  gameId: string;
  pass: AssignmentPass;
  /** Rank of the choice that landed, when the assignment came from a ranking. */
  rank?: number;
}

export interface WaitlistEntry {
  userId: string;
  gameId: string;
  rank: number;
  /** True if this game time-overlaps a game the user was assigned. Kept regardless. */
  hasConflict: boolean;
}

export interface GapReportItem {
  userId: string;
  /** "no_entry" (non-submitter, no seat found) | "no_feasible_choice" | "no_capacity" */
  reason: string;
}

export interface TableHealthItem {
  gameId: string;
  assigned: number;
  minSeats: number;
  maxSeats: number;
  belowMin: boolean;
}

export interface LotteryMetrics {
  /** Average games assigned per participant. Count interpretation of "1.6". */
  avgGamesPerUser: number;
  /** Average rank of ranked assignments (lower = better match). Rank interpretation of "1.6". */
  avgAssignedChoiceRank: number;
  /** Fraction of participants with ≥ 1 game. */
  placementRate: number;
  /** Fraction of participants with ≥ 2 games. */
  secondGameRate: number;
  /** Count of participants with 0 games (gap). */
  unplacedCount: number;
  /** Count of games below their minSeats after all passes. */
  belowMinGameCount: number;
}

export interface LotteryResult {
  dayId: string;
  seed: number;
  assignments: LotteryAssignment[];
  waitlist: WaitlistEntry[];
  gapReport: GapReportItem[];
  tableHealth: TableHealthItem[];
  metrics: LotteryMetrics;
}
