import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { getDb } from "@/db";
import {
  days,
  games,
  lotteryChoices,
  lotteryEntries,
  lotteryRuns,
  retreats,
  users,
} from "@/db/schema";
import { runLottery } from "./lottery";
import type { LotteryInput, LotteryResult } from "./types";

export async function buildLotteryInput(dayId: string, seed: number): Promise<LotteryInput> {
  const db = getDb();
  const [day] = await db
    .select({
      id: days.id,
      date: days.date,
      isCoreDay: days.isCoreDay,
      timezone: retreats.timezone,
    })
    .from(days)
    .innerJoin(retreats, eq(days.retreatId, retreats.id))
    .where(eq(days.id, dayId))
    .limit(1);
  if (!day?.isCoreDay) throw new Error("Lottery drafts can be run only for core days");

  const [gameRows, participantRows, entryRows] = await Promise.all([
    db
      .select({
        id: games.id,
        title: games.title,
        system: games.system,
        startTime: games.startTime,
        endTime: games.endTime,
        minSeats: games.minSeats,
        maxSeats: games.maxSeats,
      })
      .from(games)
      .where(and(eq(games.dayId, dayId), eq(games.kind, "FEATURED"), eq(games.status, "ACTIVE")))
      .orderBy(asc(games.startTime)),
    db.select({ id: users.id }).from(users).where(ne(users.role, "GM")).orderBy(asc(users.id)),
    db
      .select({
        id: lotteryEntries.id,
        userId: lotteryEntries.userId,
        openToOtherGames: lotteryEntries.openToOtherGames,
        avoidDuplicateSystems: lotteryEntries.avoidDuplicateSystems,
      })
      .from(lotteryEntries)
      .where(eq(lotteryEntries.dayId, dayId)),
  ]);

  if (gameRows.length === 0) throw new Error("Add at least one active featured game before running the lottery");
  if (participantRows.length === 0) throw new Error("No eligible lottery participants exist");

  const entryIds = entryRows.map((entry) => entry.id);
  const choiceRows = entryIds.length
    ? await db
        .select({
          lotteryEntryId: lotteryChoices.lotteryEntryId,
          gameId: lotteryChoices.gameId,
          rank: lotteryChoices.rank,
        })
        .from(lotteryChoices)
        .where(inArray(lotteryChoices.lotteryEntryId, entryIds))
        .orderBy(asc(lotteryChoices.rank))
    : [];
  const allowedGameIds = new Set(gameRows.map((game) => game.id));

  return {
    dayId,
    seed,
    games: gameRows.map((game) => ({
      id: game.id,
      title: game.title,
      system: game.system,
      startTime: minutesFromDay(game.startTime, day.date, day.timezone),
      endTime: minutesFromDay(game.endTime, day.date, day.timezone),
      minSeats: game.minSeats,
      maxSeats: game.maxSeats,
    })),
    participantUserIds: participantRows.map((participant) => participant.id),
    entries: entryRows.map((entry) => ({
      userId: entry.userId,
      openToOtherGames: entry.openToOtherGames,
      avoidDuplicateSystems: entry.avoidDuplicateSystems,
      choices: choiceRows
        .filter((choice) => choice.lotteryEntryId === entry.id && allowedGameIds.has(choice.gameId))
        .map((choice) => ({ gameId: choice.gameId, rank: choice.rank })),
    })),
  };
}

export async function runAndStoreLotteryDraft(
  dayId: string,
  seed: number,
  createdByUserId: string,
): Promise<{ runId: string; result: LotteryResult }> {
  const input = await buildLotteryInput(dayId, seed);
  const result = runLottery(input);
  const runId = randomUUID();
  const assignmentJson = JSON.stringify(
    result.assignments.map((assignment) => ({
      user_id: assignment.userId,
      game_id: assignment.gameId,
      pass: assignment.pass,
      rank: assignment.rank ?? null,
    })),
  );
  const waitlistJson = JSON.stringify(
    result.waitlist.map((entry) => ({
      user_id: entry.userId,
      game_id: entry.gameId,
      rank: entry.rank,
      has_conflict: entry.hasConflict,
    })),
  );
  const metricsJson = JSON.stringify(result.metrics);

  await getDb().execute(sql`
    WITH superseded_runs AS (
      UPDATE lottery_runs
      SET status = 'SUPERSEDED'
      WHERE day_id = ${dayId}::uuid AND status = 'DRAFT'
      RETURNING id
    ),
    new_run AS (
      INSERT INTO lottery_runs (
        id, day_id, seed, status, metrics, created_by_user_id, created_at
      ) VALUES (
        ${runId}::uuid,
        ${dayId}::uuid,
        ${seed},
        'DRAFT',
        ${metricsJson}::jsonb,
        ${createdByUserId}::uuid,
        now()
      )
      RETURNING id
    ),
    inserted_assignments AS (
      INSERT INTO lottery_draft_assignments (
        id, lottery_run_id, user_id, game_id, pass, rank, created_at
      )
      SELECT
        gen_random_uuid(),
        new_run.id,
        item.user_id::uuid,
        item.game_id::uuid,
        item.pass::lottery_assignment_pass,
        item.rank,
        now()
      FROM new_run
      CROSS JOIN jsonb_to_recordset(${assignmentJson}::jsonb)
        AS item(user_id text, game_id text, pass text, rank integer)
      RETURNING id
    ),
    inserted_waitlist AS (
      INSERT INTO lottery_draft_waitlist_entries (
        id, lottery_run_id, user_id, game_id, rank, has_conflict, created_at
      )
      SELECT
        gen_random_uuid(),
        new_run.id,
        item.user_id::uuid,
        item.game_id::uuid,
        item.rank,
        item.has_conflict,
        now()
      FROM new_run
      CROSS JOIN jsonb_to_recordset(${waitlistJson}::jsonb)
        AS item(user_id text, game_id text, rank integer, has_conflict boolean)
      RETURNING id
    )
    SELECT
      new_run.id,
      (SELECT count(*) FROM superseded_runs) AS superseded_count,
      (SELECT count(*) FROM inserted_assignments) AS assignment_count,
      (SELECT count(*) FROM inserted_waitlist) AS waitlist_count
    FROM new_run
  `);

  return { runId, result };
}

export function minutesFromDay(value: Date, dayDate: string, timezone: string): number {
  const localDate = formatInTimeZone(value, timezone, "yyyy-MM-dd");
  const localHour = Number(formatInTimeZone(value, timezone, "HH"));
  const localMinute = Number(formatInTimeZone(value, timezone, "mm"));
  const dayOffset = Math.round(
    (Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${dayDate}T00:00:00Z`)) / 86_400_000,
  );
  return dayOffset * 1_440 + localHour * 60 + localMinute;
}

export async function getLatestDraftRun(dayId: string) {
  return (
    await getDb()
      .select()
      .from(lotteryRuns)
      .where(and(eq(lotteryRuns.dayId, dayId), eq(lotteryRuns.status, "DRAFT")))
      .orderBy(sql`${lotteryRuns.createdAt} DESC`)
      .limit(1)
  )[0];
}
