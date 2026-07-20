import type { LotteryGame } from "./types.ts";

/**
 * Two games conflict iff their time-intervals overlap (strict overlap — touching
 * endpoints do NOT conflict, so a game ending at 14:00 and one starting at 14:00
 * are compatible).
 */
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Does `game` overlap any game in `assignedGames`? */
export function conflictsWithAny(
  game: LotteryGame,
  assignedGames: readonly LotteryGame[],
): boolean {
  return assignedGames.some((g) =>
    intervalsOverlap(game.startTime, game.endTime, g.startTime, g.endTime),
  );
}
