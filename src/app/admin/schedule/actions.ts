"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";

import { getDb } from "@/db";
import { getCurrentPhase } from "@/db/phase";
import { calendarBlocks, days, games, retreats } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid 24-hour time");
const blockTypeSchema = z.enum(["COCKTAIL_HOUR", "BREAKFAST", "MEAL", "OTHER"]);

async function requireSetup() {
  await requireAdmin();
  if ((await getCurrentPhase()) !== "SETUP") {
    throw new Error("Schedule setup is locked outside the SETUP phase");
  }
}

async function getRetreat() {
  const [retreat] = await getDb().select().from(retreats).limit(1);
  if (!retreat) throw new Error("Retreat is not configured");
  return retreat;
}

async function getDay(dayId: string, retreatId: string) {
  const [day] = await getDb()
    .select()
    .from(days)
    .where(and(eq(days.id, dayId), eq(days.retreatId, retreatId)))
    .limit(1);
  if (!day) throw new Error("Retreat day was not found");
  return day;
}

function localDateTime(date: string, time: string, timezone: string): Date {
  return fromZonedTime(`${date}T${time}:00`, timezone);
}

export async function saveDayAction(formData: FormData): Promise<void> {
  await requireSetup();
  const retreat = await getRetreat();
  const input = z
    .object({
      id: z.union([z.literal(""), idSchema]),
      date: dateSchema,
      label: z.string().trim().min(1).max(100),
      isCoreDay: z.boolean(),
    })
    .parse({
      id: formData.get("id") ?? "",
      date: formData.get("date"),
      label: formData.get("label"),
      isCoreDay: formData.get("isCoreDay") === "on",
    });

  if (input.date < retreat.startDate || input.date > retreat.endDate) {
    throw new Error("Day must fall within the retreat date range");
  }

  if (input.id) {
    await getDb()
      .update(days)
      .set({ date: input.date, label: input.label, isCoreDay: input.isCoreDay, updatedAt: new Date() })
      .where(and(eq(days.id, input.id), eq(days.retreatId, retreat.id)));
  } else {
    await getDb().insert(days).values({
      date: input.date,
      label: input.label,
      isCoreDay: input.isCoreDay,
      retreatId: retreat.id,
    });
  }
  revalidateSchedule();
  redirect("/admin/schedule?saved=day");
}

export async function deleteDayAction(formData: FormData): Promise<void> {
  await requireSetup();
  const dayId = idSchema.parse(formData.get("id"));
  if (formData.get("confirmation") !== "DELETE") throw new Error('Type "DELETE" to remove a day');

  const [[blockCount], [gameCount]] = await Promise.all([
    getDb().select({ value: count() }).from(calendarBlocks).where(eq(calendarBlocks.dayId, dayId)),
    getDb().select({ value: count() }).from(games).where(eq(games.dayId, dayId)),
  ]);
  if ((blockCount?.value ?? 0) > 0 || (gameCount?.value ?? 0) > 0) {
    throw new Error("Remove this day's calendar blocks and games before deleting it");
  }
  await getDb().delete(days).where(eq(days.id, dayId));
  revalidateSchedule();
  redirect("/admin/schedule?deleted=day");
}

export async function saveCalendarBlockAction(formData: FormData): Promise<void> {
  await requireSetup();
  const retreat = await getRetreat();
  const input = z
    .object({
      id: z.union([z.literal(""), idSchema]),
      dayId: idSchema,
      label: z.string().trim().min(1).max(120),
      type: blockTypeSchema,
      startTime: timeSchema,
      endTime: timeSchema,
    })
    .parse({
      id: formData.get("id") ?? "",
      dayId: formData.get("dayId"),
      label: formData.get("label"),
      type: formData.get("type"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
    });
  const day = await getDay(input.dayId, retreat.id);
  const startTime = localDateTime(day.date, input.startTime, retreat.timezone);
  const endTime = localDateTime(day.date, input.endTime, retreat.timezone);
  if (endTime <= startTime) throw new Error("Calendar block end time must be after its start time");

  const values = { dayId: input.dayId, label: input.label, type: input.type, startTime, endTime };
  if (input.id) {
    await getDb().update(calendarBlocks).set({ ...values, updatedAt: new Date() }).where(eq(calendarBlocks.id, input.id));
  } else {
    await getDb().insert(calendarBlocks).values(values);
  }
  revalidateSchedule();
  redirect("/admin/schedule?saved=block");
}

export async function deleteCalendarBlockAction(formData: FormData): Promise<void> {
  await requireSetup();
  const id = idSchema.parse(formData.get("id"));
  if (formData.get("confirmation") !== "DELETE") throw new Error('Type "DELETE" to remove a block');
  await getDb().delete(calendarBlocks).where(eq(calendarBlocks.id, id));
  revalidateSchedule();
  redirect("/admin/schedule?deleted=block");
}

export async function saveFeaturedGameAction(formData: FormData): Promise<void> {
  await requireSetup();
  const retreat = await getRetreat();
  const input = z
    .object({
      id: z.union([z.literal(""), idSchema]),
      dayId: idSchema,
      title: z.string().trim().min(1).max(160),
      system: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(5000),
      startTime: timeSchema,
      endTime: timeSchema,
      minSeats: z.coerce.number().int().min(0).max(100),
      maxSeats: z.coerce.number().int().min(1).max(100),
      gmUserId: z.union([z.literal(""), idSchema]),
      locationNote: z.string().trim().max(200),
    })
    .refine((value) => value.maxSeats >= value.minSeats, {
      message: "Maximum seats must be at least minimum seats",
    })
    .parse({
      id: formData.get("id") ?? "",
      dayId: formData.get("dayId"),
      title: formData.get("title"),
      system: formData.get("system"),
      description: formData.get("description"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      minSeats: formData.get("minSeats"),
      maxSeats: formData.get("maxSeats"),
      gmUserId: formData.get("gmUserId") ?? "",
      locationNote: formData.get("locationNote") ?? "",
    });
  const day = await getDay(input.dayId, retreat.id);
  const startTime = localDateTime(day.date, input.startTime, retreat.timezone);
  const endTime = localDateTime(day.date, input.endTime, retreat.timezone);
  if (endTime <= startTime) throw new Error("Game end time must be after its start time");

  const values = {
    dayId: input.dayId,
    title: input.title,
    system: input.system,
    description: input.description,
    startTime,
    endTime,
    minSeats: input.minSeats,
    maxSeats: input.maxSeats,
    gmUserId: input.gmUserId || null,
    locationNote: input.locationNote || null,
    kind: "FEATURED" as const,
  };
  if (input.id) {
    await getDb()
      .update(games)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(games.id, input.id), eq(games.kind, "FEATURED")));
  } else {
    await getDb().insert(games).values(values);
  }
  revalidateSchedule();
  redirect("/admin/schedule?saved=game");
}

export async function deleteFeaturedGameAction(formData: FormData): Promise<void> {
  await requireSetup();
  const id = idSchema.parse(formData.get("id"));
  if (formData.get("confirmation") !== "DELETE") throw new Error('Type "DELETE" to remove a game');
  await getDb().delete(games).where(and(eq(games.id, id), eq(games.kind, "FEATURED")));
  revalidateSchedule();
  redirect("/admin/schedule?deleted=game");
}

function revalidateSchedule() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
}
