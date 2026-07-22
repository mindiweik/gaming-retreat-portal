export interface RankedChoiceInput {
  gameId: string;
  rank: number;
}

export function parseRankedChoices(
  values: ReadonlyMap<string, FormDataEntryValue | null>,
  allowedGameIds: readonly string[],
): RankedChoiceInput[] {
  const allowed = new Set(allowedGameIds);
  const choices: RankedChoiceInput[] = [];

  for (const gameId of allowedGameIds) {
    const raw = values.get(gameId);
    if (raw === null || raw === "") continue;
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
      throw new Error("Every selected rank must be a whole number");
    }
    const rank = Number(raw);
    if (rank < 1 || rank > allowedGameIds.length) {
      throw new Error("A selected rank is outside the available range");
    }
    choices.push({ gameId, rank });
  }

  if (choices.length === 0) throw new Error("Rank at least one featured game");
  if (choices.some((choice) => !allowed.has(choice.gameId))) {
    throw new Error("A ranked game is not available for this day");
  }
  if (new Set(choices.map((choice) => choice.rank)).size !== choices.length) {
    throw new Error("Each ranked game must have a unique rank");
  }

  const sorted = choices.sort((a, b) => a.rank - b.rank);
  if (sorted.some((choice, index) => choice.rank !== index + 1)) {
    throw new Error("Ranks must be consecutive, starting with 1");
  }
  return sorted;
}
