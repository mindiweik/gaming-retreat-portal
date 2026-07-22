"use server";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { getCurrentPhase } from "@/db/phase";
import { days, games } from "@/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { parseRankedChoices } from "@/lib/lottery-submission";

const idSchema = z.uuid();

export async function saveLotteryEntryAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  if (user.role === "GM") throw new Error("Featured-game GMs do not participate in the lottery");
  const userId = idSchema.parse(user.id);
  if ((await getCurrentPhase()) !== "LOTTERY_SIGNUP") {
    throw new Error("Lottery rankings are not currently open");
  }

  const dayId = idSchema.parse(formData.get("dayId"));
  const [day] = await getDb()
    .select({ id: days.id, isCoreDay: days.isCoreDay })
    .from(days)
    .where(eq(days.id, dayId))
    .limit(1);
  if (!day?.isCoreDay) throw new Error("Lottery rankings are available only for core days");

  const availableGames = await getDb()
    .select({ id: games.id })
    .from(games)
    .where(
      and(eq(games.dayId, dayId), eq(games.kind, "FEATURED"), eq(games.status, "ACTIVE")),
    );
  const allowedGameIds = availableGames.map((game) => game.id);
  const rankValues = new Map(
    allowedGameIds.map((gameId) => [gameId, formData.get(`rank:${gameId}`)] as const),
  );
  const choices = parseRankedChoices(rankValues, allowedGameIds);
  const openToOtherGames = formData.get("openToOtherGames") === "on";
  const avoidDuplicateSystems = formData.get("avoidDuplicateSystems") === "on";
  const choiceJson = JSON.stringify(
    choices.map((choice) => ({ game_id: choice.gameId, rank: choice.rank })),
  );

  // One statement keeps entry flags and the replacement choice list atomic.
  await getDb().execute(sql`
    WITH upserted_entry AS (
      INSERT INTO lottery_entries (
        id, user_id, day_id, open_to_other_games, avoid_duplicate_systems, created_at, updated_at
      ) VALUES (
        ${randomUUID()}::uuid,
        ${userId}::uuid,
        ${dayId}::uuid,
        ${openToOtherGames},
        ${avoidDuplicateSystems},
        now(),
        now()
      )
      ON CONFLICT (user_id, day_id) DO UPDATE SET
        open_to_other_games = EXCLUDED.open_to_other_games,
        avoid_duplicate_systems = EXCLUDED.avoid_duplicate_systems,
        updated_at = now()
      RETURNING id
    ),
    removed_choices AS (
      DELETE FROM lottery_choices
      USING upserted_entry
      WHERE lottery_choices.lottery_entry_id = upserted_entry.id
      RETURNING lottery_choices.id
    ),
    prepared_choices AS (
      SELECT
        upserted_entry.id AS lottery_entry_id,
        choice.game_id::uuid AS game_id,
        choice.rank::integer AS rank,
        (SELECT count(*) FROM removed_choices) AS removed_count
      FROM upserted_entry
      CROSS JOIN jsonb_to_recordset(${choiceJson}::jsonb) AS choice(game_id text, rank integer)
    )
    INSERT INTO lottery_choices (id, lottery_entry_id, game_id, rank, created_at)
    SELECT gen_random_uuid(), lottery_entry_id, game_id, rank, now()
    FROM prepared_choices
  `);

  revalidatePath("/lottery");
  redirect(`/lottery?day=${dayId}&saved=1`);
}
