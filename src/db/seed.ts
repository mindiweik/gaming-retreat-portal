import { eq } from "drizzle-orm";

import { getDb } from "./index";
import { days, phaseState, retreats } from "./schema";

const RETREAT_NAME = "Gaming Retreat 2027";
const RETREAT_START = "2027-06-10";
const RETREAT_END = "2027-06-14";

const RETREAT_DAYS = [
  { date: "2027-06-10", label: "Bookend - Thursday", isCoreDay: false },
  { date: "2027-06-11", label: "Day 1 - Friday", isCoreDay: true },
  { date: "2027-06-12", label: "Day 2 - Saturday", isCoreDay: true },
  { date: "2027-06-13", label: "Day 3 - Sunday", isCoreDay: true },
  { date: "2027-06-14", label: "Bookend - Monday", isCoreDay: false },
] as const;

export async function seedRetreat(): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(retreats).where(eq(retreats.name, RETREAT_NAME)).limit(1);
  const retreat =
    existing ??
    (
      await db
        .insert(retreats)
        .values({
          name: RETREAT_NAME,
          startDate: RETREAT_START,
          endDate: RETREAT_END,
          timezone: "America/Los_Angeles",
        })
        .returning()
    )[0];

  if (!retreat) throw new Error("Retreat could not be created");

  await db
    .insert(days)
    .values(RETREAT_DAYS.map((day) => ({ ...day, retreatId: retreat.id })))
    .onConflictDoUpdate({
      target: [days.retreatId, days.date],
      set: { updatedAt: new Date() },
    });

  await db.insert(phaseState).values({ id: 1, current: "SETUP" }).onConflictDoNothing();

  console.log(`Seeded ${RETREAT_NAME}: ${RETREAT_DAYS.length} days, initial phase SETUP`);
}

if (import.meta.main) {
  await seedRetreat();
}
