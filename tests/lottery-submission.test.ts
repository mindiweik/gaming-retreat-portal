import { describe, expect, test } from "bun:test";

import { parseRankedChoices } from "../src/lib/lottery-submission.ts";

function values(input: Record<string, string>): ReadonlyMap<string, FormDataEntryValue | null> {
  return new Map(Object.entries(input));
}

describe("lottery submission validation", () => {
  test("returns selected choices in rank order", () => {
    expect(parseRankedChoices(values({ g1: "2", g2: "", g3: "1" }), ["g1", "g2", "g3"])).toEqual([
      { gameId: "g3", rank: 1 },
      { gameId: "g1", rank: 2 },
    ]);
  });

  test("rejects duplicate ranks", () => {
    expect(() => parseRankedChoices(values({ g1: "1", g2: "1" }), ["g1", "g2"])).toThrow(
      "unique rank",
    );
  });

  test("rejects missing, out-of-range, and gapped selections", () => {
    expect(() => parseRankedChoices(values({ g1: "" }), ["g1"])).toThrow("Rank at least one");
    expect(() => parseRankedChoices(values({ g1: "2" }), ["g1"])).toThrow("outside");
    expect(() => parseRankedChoices(values({ g1: "1", g2: "3", g3: "" }), ["g1", "g2", "g3"])).toThrow(
      "consecutive",
    );
  });
});
