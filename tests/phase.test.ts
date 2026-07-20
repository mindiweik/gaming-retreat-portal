import { describe, expect, test } from "bun:test";

import { isValidPhaseTransition, PHASE_ORDER } from "../src/db/phase.ts";

describe("phase state machine", () => {
  test("allows each forward transition in order", () => {
    for (let index = 0; index < PHASE_ORDER.length - 1; index++) {
      expect(isValidPhaseTransition(PHASE_ORDER[index]!, PHASE_ORDER[index + 1]!)).toBe(true);
    }
  });

  test("rejects skipping, reversing, and repeating phases", () => {
    expect(isValidPhaseTransition("SETUP", "LOTTERY_DRAFT")).toBe(false);
    expect(isValidPhaseTransition("LOTTERY_SIGNUP", "SETUP")).toBe(false);
    expect(isValidPhaseTransition("LIVE", "LIVE")).toBe(false);
    expect(isValidPhaseTransition("LIVE", "SETUP")).toBe(false);
  });
});
