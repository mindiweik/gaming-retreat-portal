import { and, eq } from "drizzle-orm";

import { getDb } from "./index";
import { phaseState, type Phase } from "./schema";

export const PHASE_ORDER = [
  "SETUP",
  "LOTTERY_SIGNUP",
  "LOTTERY_DRAFT",
  "RESULTS_PUBLISHED",
  "ATTENDEE_SIGNUP",
  "TABLE_ASSIGNMENT",
  "LIVE",
] as const satisfies readonly Phase[];

export function isValidPhaseTransition(current: Phase, next: Phase): boolean {
  return PHASE_ORDER.indexOf(next) === PHASE_ORDER.indexOf(current) + 1;
}

export async function getCurrentPhase(): Promise<Phase> {
  const [state] = await getDb().select().from(phaseState).where(eq(phaseState.id, 1)).limit(1);
  if (!state) throw new Error("Phase state has not been seeded");
  return state.current;
}

/**
 * Advance the singleton phase by exactly one step. The expected-current check
 * prevents two admins or duplicate requests from advancing stale state.
 */
export async function advancePhase(
  expectedCurrent: Phase,
  next: Phase,
  updatedByUserId: string,
): Promise<Phase> {
  if (!isValidPhaseTransition(expectedCurrent, next)) {
    throw new Error(`Invalid phase transition: ${expectedCurrent} → ${next}`);
  }

  const [updated] = await getDb()
    .update(phaseState)
    .set({ current: next, updatedAt: new Date(), updatedByUserId })
    .where(and(eq(phaseState.id, 1), eq(phaseState.current, expectedCurrent)))
    .returning({ current: phaseState.current });

  if (!updated) {
    throw new Error("Phase changed before this request completed; refresh and try again");
  }
  return updated.current;
}
