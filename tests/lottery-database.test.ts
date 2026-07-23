import { describe, expect, test } from "bun:test";
import { fromZonedTime } from "date-fns-tz";

import { minutesFromDay } from "../src/lottery/database.ts";

describe("lottery database time conversion", () => {
  test("converts Vegas local times to minutes from the retreat day", () => {
    const value = fromZonedTime("2027-06-10T10:30:00", "America/Los_Angeles");
    expect(minutesFromDay(value, "2027-06-10", "America/Los_Angeles")).toBe(630);
  });

  test("preserves next-day offsets for games ending after midnight", () => {
    const value = fromZonedTime("2027-06-11T01:15:00", "America/Los_Angeles");
    expect(minutesFromDay(value, "2027-06-10", "America/Los_Angeles")).toBe(1515);
  });
});
