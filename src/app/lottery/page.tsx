import { and, asc, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";

import { saveLotteryEntryAction } from "./actions";
import { getDb } from "@/db";
import {
  calendarBlocks,
  days,
  games,
  lotteryChoices,
  lotteryEntries,
  phaseState,
  retreatTables,
  retreats,
  users,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/session";

interface LotteryPageProps {
  searchParams: Promise<{ day?: string; saved?: string }>;
}

export const dynamic = "force-dynamic";

export default async function LotteryPage({ searchParams }: LotteryPageProps) {
  const user = await requireAuth();
  const params = await searchParams;
  const db = getDb();
  const [retreat] = await db.select().from(retreats).orderBy(asc(retreats.startDate)).limit(1);
  if (!retreat) throw new Error("Retreat is not configured");

  const coreDays = await db
    .select()
    .from(days)
    .where(and(eq(days.retreatId, retreat.id), eq(days.isCoreDay, true)))
    .orderBy(asc(days.date));
  const selectedDay = coreDays.find((day) => day.id === params.day) ?? coreDays[0];
  const [phase] = await db.select().from(phaseState).where(eq(phaseState.id, 1)).limit(1);
  const editable = phase?.current === "LOTTERY_SIGNUP" && user.role !== "GM";

  if (!selectedDay) {
    return <LotteryEmpty title="No core days configured" detail="An admin needs to configure the lottery calendar." />;
  }

  const [featuredGames, blocks] = await Promise.all([
    db
      .select({
        id: games.id,
        title: games.title,
        description: games.description,
        system: games.system,
        startTime: games.startTime,
        endTime: games.endTime,
        minSeats: games.minSeats,
        maxSeats: games.maxSeats,
        gmName: users.name,
        tableNumber: retreatTables.number,
        tableLabel: retreatTables.label,
        locationNote: games.locationNote,
      })
      .from(games)
      .leftJoin(users, eq(games.gmUserId, users.id))
      .leftJoin(retreatTables, eq(games.tableId, retreatTables.id))
      .where(
        and(
          eq(games.dayId, selectedDay.id),
          eq(games.kind, "FEATURED"),
          eq(games.status, "ACTIVE"),
        ),
      )
      .orderBy(asc(games.startTime)),
    db
      .select()
      .from(calendarBlocks)
      .where(eq(calendarBlocks.dayId, selectedDay.id))
      .orderBy(asc(calendarBlocks.startTime)),
  ]);

  const existingEntry = isUuid(user.id)
    ? (
        await db
          .select()
          .from(lotteryEntries)
          .where(
            and(eq(lotteryEntries.userId, user.id), eq(lotteryEntries.dayId, selectedDay.id)),
          )
          .limit(1)
      )[0]
    : undefined;
  const existingChoices = existingEntry
    ? await db
        .select()
        .from(lotteryChoices)
        .where(eq(lotteryChoices.lotteryEntryId, existingEntry.id))
        .orderBy(asc(lotteryChoices.rank))
    : [];
  const rankByGame = new Map(existingChoices.map((choice) => [choice.gameId, choice.rank]));
  const schedule = [
    ...blocks.map((block) => ({
      kind: "block" as const,
      id: block.id,
      title: block.label,
      subtitle: formatLabel(block.type),
      startTime: block.startTime,
      endTime: block.endTime,
    })),
    ...featuredGames.map((game) => ({
      kind: "game" as const,
      id: game.id,
      title: game.title,
      subtitle: game.system,
      startTime: game.startTime,
      endTime: game.endTime,
    })),
  ].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return (
    <main className="lottery-shell">
      <header className="lottery-header">
        <div>
          <p className="eyebrow">Featured game lottery // Las Vegas time</p>
          <h1>Rank your games</h1>
          <p>
            Choose as many games as you want, then give each a unique rank. Rank 1 is your top
            choice. Rankings are saved independently for each core day.
          </p>
        </div>
        <Link className="secondary-button" href="/">Back to portal</Link>
      </header>

      <nav className="lottery-day-tabs" aria-label="Core lottery days">
        {coreDays.map((day, index) => (
          <Link
            aria-current={day.id === selectedDay.id ? "page" : undefined}
            className={day.id === selectedDay.id ? "selected" : undefined}
            href={`/lottery?day=${day.id}`}
            key={day.id}
          >
            <span>Day {String(index + 1).padStart(2, "0")}</span>
            <strong>{formatInTimeZone(`${day.date}T12:00:00Z`, "UTC", "EEEE")}</strong>
            <small>{formatInTimeZone(`${day.date}T12:00:00Z`, "UTC", "MMM d")}</small>
          </Link>
        ))}
      </nav>

      {!editable ? (
        <div className="lottery-notice">
          <strong>{user.role === "ADMIN" ? "Admin preview" : user.role === "GM" ? "GM view only" : "Rankings are not open yet"}</strong>
          <span>
            {user.role === "GM"
              ? "Featured-game GMs do not participate in the player lottery."
              : `Current phase: ${formatLabel(phase?.current ?? "SETUP")}. Controls unlock in Lottery Signup.`}
          </span>
        </div>
      ) : null}
      {params.saved === "1" ? <p className="lottery-saved">Your rankings for {selectedDay.label} are saved.</p> : null}

      <section className="lottery-calendar">
        <div className="lottery-section-heading">
          <div><p className="eyebrow">Calendar view</p><h2>{selectedDay.label}</h2></div>
          <span>{featuredGames.length} featured {featuredGames.length === 1 ? "game" : "games"}</span>
        </div>
        <div className="lottery-timeline">
          {schedule.length ? schedule.map((event) => (
            <article className={`lottery-calendar-row ${event.kind}`} key={`${event.kind}-${event.id}`}>
              <time>
                <strong>{formatInTimeZone(event.startTime, retreat.timezone, "HH:mm")}</strong>
                <span>{formatInTimeZone(event.endTime, retreat.timezone, "HH:mm")}</span>
              </time>
              <div>
                <span>{event.kind === "game" ? "Featured" : event.subtitle}</span>
                <h3>{event.title}</h3>
                {event.kind === "game" && rankByGame.has(event.id) ? <em>Current rank #{rankByGame.get(event.id)}</em> : null}
              </div>
            </article>
          )) : <p className="lottery-empty-state">Nothing has been scheduled for this day yet.</p>}
        </div>
      </section>

      <section className="ranking-panel">
        <div className="lottery-section-heading">
          <div><p className="eyebrow">Ranking panel</p><h2>Your choices</h2></div>
          {existingEntry ? <span>Last saved submission loaded</span> : <span>Not submitted</span>}
        </div>

        {featuredGames.length ? (
          <form action={saveLotteryEntryAction}>
            <input name="dayId" type="hidden" value={selectedDay.id} />
            <fieldset disabled={!editable}>
              <legend className="sr-only">Rank featured games for {selectedDay.label}</legend>
              <div className="ranking-list">
                {featuredGames.map((game) => (
                  <article className="ranking-row" key={game.id}>
                    <label>
                      <span>Rank</span>
                      <select
                        aria-label={`Rank ${game.title}`}
                        defaultValue={rankByGame.get(game.id)?.toString() ?? ""}
                        name={`rank:${game.id}`}
                      >
                        <option value="">—</option>
                        {featuredGames.map((_, index) => (
                          <option key={index + 1} value={index + 1}>{index + 1}</option>
                        ))}
                      </select>
                    </label>
                    <div className="ranking-game-info">
                      <div><span>{game.system}</span><span>{formatTimeRange(game.startTime, game.endTime, retreat.timezone)}</span></div>
                      <h3>{game.title}</h3>
                      <p>{game.description}</p>
                      <small>
                        {`${game.gmName ? `GM: ${game.gmName}` : "GM: TBD"} // ${game.minSeats}–${game.maxSeats} seats // ${formatLocation(game)}`}
                      </small>
                    </div>
                  </article>
                ))}
              </div>

              <div className="lottery-preferences">
                <label>
                  <input defaultChecked={existingEntry?.openToOtherGames ?? false} name="openToOtherGames" type="checkbox" />
                  <span><strong>Open to other games</strong><small>If none of your ranked choices work, place you in another open seat.</small></span>
                </label>
                <label>
                  <input defaultChecked={existingEntry?.avoidDuplicateSystems ?? false} name="avoidDuplicateSystems" type="checkbox" />
                  <span><strong>Avoid duplicate systems</strong><small>Try not to assign two games using the same system on this day.</small></span>
                </label>
              </div>

              <div className="lottery-submit-row">
                <p>Use each rank once. Unranked games are not considered choices.</p>
                <button className="primary-button" type="submit">Save {selectedDay.label} rankings</button>
              </div>
            </fieldset>
          </form>
        ) : (
          <p className="lottery-empty-state">No featured games are available to rank yet.</p>
        )}
      </section>
    </main>
  );
}

function LotteryEmpty({ title, detail }: { title: string; detail: string }) {
  return <main className="lottery-shell"><section className="lottery-empty-state"><h1>{title}</h1><p>{detail}</p><Link href="/">Back to portal</Link></section></main>;
}

function formatTimeRange(start: Date, end: Date, timezone: string): string {
  return `${formatInTimeZone(start, timezone, "HH:mm")}–${formatInTimeZone(end, timezone, "HH:mm")}`;
}

function formatLocation(game: { tableLabel: string | null; tableNumber: number | null; locationNote: string | null }): string {
  if (game.tableLabel) return game.tableLabel;
  if (game.tableNumber) return `Table ${game.tableNumber}`;
  return game.locationNote ?? "Location TBD";
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
