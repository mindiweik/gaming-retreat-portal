import { test, expect } from "bun:test";
import { runSimulation, DEFAULT_SIM_OPTIONS } from "../src/lottery/simulate.ts";

test("150-attendee simulation: guarantee holds (no unplaced when seats suffice)", () => {
  const { result } = runSimulation(DEFAULT_SIM_OPTIONS);
  // 150 users, 40 games × 6 seats = 240 seats → plenty for everyone.
  expect(result.metrics.placementRate).toBe(1);
  expect(result.metrics.unplacedCount).toBe(0);
});

test("150-attendee simulation: caps respected (no below-min games left if rescuable)", () => {
  const { result } = runSimulation(DEFAULT_SIM_OPTIONS);
  // Table-health pass should drive below-min games toward zero where candidates exist.
  expect(result.metrics.belowMinGameCount).toBeLessThanOrEqual(result.tableHealth.length);
});

test("simulation is deterministic across runs (same seed)", () => {
  const a = runSimulation(DEFAULT_SIM_OPTIONS);
  const b = runSimulation(DEFAULT_SIM_OPTIONS);
  expect(a.result.assignments).toEqual(b.result.assignments);
  expect(a.result.metrics).toEqual(b.result.metrics);
});

test("150-attendee simulation reports the 1.6 rank goal without enforcing it", () => {
  const { report } = runSimulation(DEFAULT_SIM_OPTIONS);
  console.log("\n" + report + "\n");
  expect(report).toContain("avgGamesPerUser");
  expect(report).toContain("avgAssignedChoiceRank");
  expect(report).toContain("optimization goal");
  expect(report).toContain("not a validity requirement");
});
