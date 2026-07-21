import { eq } from "drizzle-orm";

import { getDb } from "./index";
import { days, phaseState, retreats } from "./schema";

const RETREAT_NAME = "Gaming Retreat 2027";
const RETREAT_START = "2027-06-09";
const RETREAT_END = "2027-06-13";

const RETREAT_DAYS = [
  { date: "2027-06-09", label: "Bookend - Wednesday", isCoreDay: false },
  { date: "2027-06-10", label: "Day 1 - Thursday", isCoreDay: true },
  { date: "2027-06-11", label: "Day 2 - Friday", isCoreDay: true },
  { date: "2027-06-12", label: "Day 3 - Saturday", isCoreDay: true },
  { date: "2027-06-13", label: "Bookend - Sunday", isCoreDay: false },
] as const;

export async function seedRetreat(): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(retreats).where(eq(retreats.name, RETREAT_NAME)).limit(1);
  const retreat = existing
    ? (
        await db
          .update(retreats)
          .set({
            startDate: RETREAT_START,
            endDate: RETREAT_END,
            timezone: "America/Los_Angeles",
            updatedAt: new Date(),
          })
          .where(eq(retreats.id, existing.id))
          .returning()
      )[0]
    : (
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

  for (const day of RETREAT_DAYS) {
    await db
      .insert(days)
      .values({ ...day, retreatId: retreat.id })
      .onConflictDoUpdate({
        target: [days.retreatId, days.date],
        set: { label: day.label, isCoreDay: day.isCoreDay, updatedAt: new Date() },
      });
  }

  await db.insert(phaseState).values({ id: 1, current: "SETUP" }).onConflictDoNothing();

  console.log(`Seeded ${RETREAT_NAME}: ${RETREAT_DAYS.length} days, initial phase SETUP`);
}

if (import.meta.main) {
  await seedRetreat();
}
