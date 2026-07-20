import { runLottery } from "./lottery.ts";
import type { LotteryEntry, LotteryGame, LotteryInput, LotteryResult } from "./types.ts";

export interface SimOptions {
  /** Attendees (participants) per day. */
  users: number;
  /** Games per day. */
  games: number;
  /** Seats per game: maxSeats. */
  maxSeats: number;
  /** minSeats per game. */
  minSeats: number;
  /** Distinct time slots; games are spread across these (each slot is non-overlapping). */
  timeSlots: number;
  /** Fraction of participants who submit rankings (rest are non-submitters). */
  submitterFraction: number;
  /** Fraction of submitters who set openToOtherGames. */
  openToOtherFraction: number;
  /** Fraction of submitters who set avoidDuplicateSystems. */
  avoidDupFraction: number;
  /** Distinct systems (for avoidDuplicateSystems to bite). */
  systems: number;
  /** Per-day seed. */
  seed: number;
  /** Number of ranked choices each submitter makes. */
  choicesPerSubmitter: number;
  /** Day label. */
  dayId: string;
}

export const DEFAULT_SIM_OPTIONS: SimOptions = {
  users: 150,
  games: 40,
  maxSeats: 6,
  minSeats: 4,
  timeSlots: 3,
  submitterFraction: 0.9,
  openToOtherFraction: 0.6,
  avoidDupFraction: 0.2,
  systems: 8,
  seed: 12345,
  choicesPerSubmitter: 5,
  dayId: "day-1",
};

/** Deterministic pseudo-random in [0,1) for reproducible sim data. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build simulated lottery input for one day. */
export function buildSimInput(opts: SimOptions = DEFAULT_SIM_OPTIONS): LotteryInput {
  const rng = makeRng(opts.seed * 7919 + 1); // decouple data-gen RNG from lottery seed
  const slotLen = Math.floor(480 / opts.timeSlots); // 8-hour day (480 min), slots don't overlap
  const games: LotteryGame[] = [];
  for (let i = 0; i < opts.games; i++) {
    const slot = i % opts.timeSlots;
    const start = slot * slotLen + Math.floor(rng() * 30);
    const duration = 90 + Math.floor(rng() * 90); // 90–180 min
    games.push({
      id: `g${i}`,
      title: `Game ${i}`,
      system: `system-${Math.floor(rng() * opts.systems)}`,
      startTime: start,
      endTime: start + duration,
      minSeats: opts.minSeats,
      maxSeats: opts.maxSeats,
    });
  }

  const participantUserIds: string[] = [];
  for (let i = 0; i < opts.users; i++) participantUserIds.push(`u${i}`);

  const submitterCount = Math.round(opts.users * opts.submitterFraction);
  const submitters = participantUserIds.slice(0, submitterCount);

  const entries: LotteryEntry[] = submitters.map((userId) => {
    const openToOtherGames = rng() < opts.openToOtherFraction;
    const avoidDuplicateSystems = rng() < opts.avoidDupFraction;
    // Random distinct ranked choices.
    const pool = games.map((g) => g.id);
    // Fisher–Yates partial shuffle to pick `choicesPerSubmitter` distinct games.
    const chosen: { gameId: string; rank: number }[] = [];
    for (let r = 1; r <= opts.choicesPerSubmitter && pool.length > 0; r++) {
      const j = Math.floor(rng() * pool.length);
      const gameId = pool.splice(j, 1)[0]!;
      chosen.push({ gameId, rank: r });
    }
    return {
      userId,
      openToOtherGames,
      avoidDuplicateSystems,
      choices: chosen,
    };
  });

  return {
    dayId: opts.dayId,
    games,
    entries,
    participantUserIds,
    seed: opts.seed,
  };
}

/** Run the simulation and return the result + a human-readable report. */
export function runSimulation(opts: SimOptions = DEFAULT_SIM_OPTIONS): {
  result: LotteryResult;
  report: string;
} {
  const input = buildSimInput(opts);
  const result = runLottery(input);
  const m = result.metrics;
  const totalSeats = opts.games * opts.maxSeats;

  const lines: string[] = [
    `Lottery simulation — day ${opts.dayId} (seed ${opts.seed})`,
    `  participants:     ${opts.users}`,
    `  games:            ${opts.games}  (total seats: ${totalSeats}, seats/user: ${(totalSeats / opts.users).toFixed(2)})`,
    `  submitters:       ${Math.round(opts.users * opts.submitterFraction)} (${Math.round(opts.submitterFraction * 100)}%)`,
    ``,
    `  metrics:`,
    `    avgGamesPerUser         ${m.avgGamesPerUser.toFixed(3)}`,
    `    avgAssignedChoiceRank   ${m.avgAssignedChoiceRank.toFixed(3)}   ${m.avgAssignedChoiceRank <= 1.6 ? "✅ meets 1.6 goal" : "ℹ️  above 1.6 goal; review or rerun"}`,
    `    placementRate           ${(m.placementRate * 100).toFixed(1)}%   (guarantee: everyone ≥ 1 game, when capacity allows)`,
    `    secondGameRate          ${(m.secondGameRate * 100).toFixed(1)}%`,
    `    unplacedCount           ${m.unplacedCount}`,
    `    belowMinGameCount       ${m.belowMinGameCount}`,
    ``,
    `  The 1.6 value is an optimization goal for average assigned choice rank,`,
    `  not a validity requirement. Admins may review, rerun, adjust, or publish`,
    `  a draft above the goal.`,
  ];

  return { result, report: lines.join("\n") };
}
