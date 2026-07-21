import { and, asc, count, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";

import { getDb } from "@/db";
import {
  calendarBlocks,
  days,
  games,
  phaseState,
  registrations,
  retreatTables,
  retreats,
  users,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";

interface HomeProps {
  searchParams: Promise<{ authError?: string; day?: string }>;
}

type ScheduleEvent =
  | {
      kind: "block";
      id: string;
      title: string;
      type: string;
      startTime: Date;
      endTime: Date;
    }
  | {
      kind: "game";
      id: string;
      title: string;
      system: string;
      gameKind: "FEATURED" | "ATTENDEE_LED";
      startTime: Date;
      endTime: Date;
      gmName: string | null;
      tableNumber: number | null;
      tableLabel: string | null;
      locationNote: string | null;
    };

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: HomeProps) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  const db = getDb();
  const [retreat] = await db.select().from(retreats).orderBy(asc(retreats.startDate)).limit(1);
  const retreatDays = retreat
    ? await db.select().from(days).where(eq(days.retreatId, retreat.id)).orderBy(asc(days.date))
    : [];
  const selectedDay =
    retreatDays.find((day) => day.id === params.day) ??
    retreatDays.find((day) => day.isCoreDay) ??
    retreatDays[0];

  const [phase] = await db.select().from(phaseState).where(eq(phaseState.id, 1)).limit(1);
  const [blocks, gameRows, confirmedCount] = selectedDay
    ? await Promise.all([
        db
          .select()
          .from(calendarBlocks)
          .where(eq(calendarBlocks.dayId, selectedDay.id))
          .orderBy(asc(calendarBlocks.startTime)),
        db
          .select({
            id: games.id,
            title: games.title,
            system: games.system,
            kind: games.kind,
            startTime: games.startTime,
            endTime: games.endTime,
            gmName: users.name,
            tableNumber: retreatTables.number,
            tableLabel: retreatTables.label,
            locationNote: games.locationNote,
          })
          .from(games)
          .leftJoin(users, eq(games.gmUserId, users.id))
          .leftJoin(retreatTables, eq(games.tableId, retreatTables.id))
          .where(and(eq(games.dayId, selectedDay.id), eq(games.status, "ACTIVE")))
          .orderBy(asc(games.startTime)),
        user && isUuid(user.id)
          ? db
              .select({ value: count() })
              .from(registrations)
              .innerJoin(games, eq(registrations.gameId, games.id))
              .where(
                and(
                  eq(registrations.userId, user.id),
                  eq(registrations.status, "CONFIRMED"),
                  eq(games.dayId, selectedDay.id),
                ),
              )
          : Promise.resolve([{ value: 0 }]),
      ])
    : [[], [], [{ value: 0 }]];

  const schedule: ScheduleEvent[] = [
    ...blocks.map((block) => ({
      kind: "block" as const,
      id: block.id,
      title: block.label,
      type: block.type,
      startTime: block.startTime,
      endTime: block.endTime,
    })),
    ...gameRows.map((game) => ({
      kind: "game" as const,
      id: game.id,
      title: game.title,
      system: game.system,
      gameKind: game.kind,
      startTime: game.startTime,
      endTime: game.endTime,
      gmName: game.gmName,
      tableNumber: game.tableNumber,
      tableLabel: game.tableLabel,
      locationNote: game.locationNote,
    })),
  ].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const timezone = retreat?.timezone ?? "America/Los_Angeles";
  const currentPhase = phase?.current ?? "SETUP";
  const authConfigured = Boolean(
    process.env.DISCORD_CLIENT_ID &&
      process.env.DISCORD_CLIENT_SECRET &&
      process.env.DISCORD_REDIRECT_URI,
  );

  return (
    <main className="portal-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Gaming Retreat home">
          <span className="brand-mark" aria-hidden="true">GR</span>
          <span>
            <strong>Gaming Retreat</strong>
            <small>Player Portal // 2027</small>
          </span>
        </Link>

        <nav className="topnav" aria-label="Primary navigation">
          <a className="is-active" href="#schedule">Schedule</a>
          <a href="#games">Games</a>
          <a href="#lottery">Lottery</a>
        </nav>

        <div className="account-actions">
          {user ? (
            <>
              <a className="admin-link" href="/profile">Profile</a>
              {user.role === "ADMIN" ? <a className="admin-link" href="/admin">Admin</a> : null}
              <div className="user-chip">
                <span className="online-dot" aria-hidden="true" />
                <span><small>{user.role}</small><strong>{user.name}</strong></span>
              </div>
              <form action="/api/auth/logout" method="post">
                <button className="sign-out-button" type="submit">Sign out</button>
              </form>
            </>
          ) : null}
        </div>
      </header>

      <div className="dashboard">
        <aside className="sidebar" aria-label="Retreat days">
          <p className="eyebrow">Retreat days</p>
          <div className="day-list">
            {retreatDays.map((day, index) => (
              <Link
                aria-current={day.id === selectedDay?.id ? "page" : undefined}
                className={day.id === selectedDay?.id ? "selected" : undefined}
                href={`/?day=${day.id}`}
                key={day.id}
              >
                <span>{formatInTimeZone(`${day.date}T12:00:00Z`, "UTC", "EEE").toUpperCase()}</span>
                <strong>{formatInTimeZone(`${day.date}T12:00:00Z`, "UTC", "dd")}</strong>
                <small>{day.isCoreDay ? `Day ${String(coreDayNumber(retreatDays, index)).padStart(2, "0")}` : "Bookend"}</small>
              </Link>
            ))}
          </div>
          <div className="sidebar-status">
            <span className="status-light" aria-hidden="true" />
            <div><small>Portal status</small><strong>{formatPhase(currentPhase)}</strong></div>
          </div>
        </aside>

        <section className="content" id="schedule">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">
                {selectedDay ? `${formatDayHeading(selectedDay.date)} // ${selectedDay.isCoreDay ? selectedDay.label : "Bookend"}` : "Retreat schedule"}
              </p>
              <h1>{user ? `Ready, ${user.name}?` : "Your weekend. Your games."}</h1>
              <p className="lede">Browse the live retreat schedule, rank featured sessions, and never lose track of your table.</p>
            </div>

            {!user ? (
              <div className="login-panel">
                {params.authError ? <p role="alert" className="auth-error">Sign-in failed ({params.authError}). Check the configuration and try again.</p> : null}
                {authConfigured ? <a className="primary-button" href="/api/auth/login"><span aria-hidden="true">◈</span> Continue with Discord</a> : <p>Discord sign-in appears after local credentials are configured.</p>}
                {process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_LOGIN_DISCORD_ID ? <a className="secondary-button" href="/api/auth/dev">Local dev login</a> : null}
              </div>
            ) : (
              <a className="primary-button" href="#lottery">View lottery status <span>→</span></a>
            )}
          </div>

          <div className="status-grid" id="lottery">
            <StatusCard accent="cyan" number="01" label="Lottery" title={lotteryStatus(currentPhase)} detail="Featured-game rankings and assignments follow the retreat phase." />
            <StatusCard accent="pink" number="02" label="My games" title={`${confirmedCount[0]?.value ?? 0} confirmed`} detail={`Confirmed sessions for ${selectedDay?.label ?? "this day"}.`} />
            <StatusCard accent="lime" number="03" label="Open signup" title={signupStatus(currentPhase)} detail="Attendee-led signup opens after lottery results are published." />
          </div>

          <section className="schedule-panel" id="games">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Live schedule // Las Vegas time</p>
                <h2>{selectedDay?.label ?? "Schedule"}</h2>
              </div>
              <div className="legend" aria-label="Schedule legend">
                <span><i className="legend-featured" /> Featured</span>
                <span><i className="legend-attendee" /> Attendee-led</span>
                <span><i className="legend-block" /> Event</span>
              </div>
            </div>

            {schedule.length ? (
              <div className="schedule-board live-schedule-board">
                <div className="game-list">
                  {schedule.map((event, index) =>
                    event.kind === "game" ? (
                      <article className={`game-card ${event.gameKind === "ATTENDEE_LED" ? "tone-pink" : index % 2 ? "tone-lime" : "tone-cyan"}`} key={`game-${event.id}`}>
                        <div className="game-number">{String(index + 1).padStart(2, "0")}</div>
                        <EventTime start={event.startTime} end={event.endTime} timezone={timezone} />
                        <div className="game-info">
                          <div className="game-tags"><span>{event.gameKind === "FEATURED" ? "Featured" : "Attendee-led"}</span><span>{event.system}</span></div>
                          <h3>{event.title}</h3>
                          <p>{event.gmName ? `Hosted by ${event.gmName}` : "GM to be announced"}</p>
                        </div>
                        <div className="table-code"><small>Location</small><strong>{formatLocation(event)}</strong></div>
                      </article>
                    ) : (
                      <article className="calendar-event-row" key={`block-${event.id}`}>
                        <div className="event-icon" aria-hidden="true">◆</div>
                        <EventTime start={event.startTime} end={event.endTime} timezone={timezone} />
                        <div><span>{formatPhase(event.type)}</span><h3>{event.title}</h3></div>
                      </article>
                    ),
                  )}
                </div>
              </div>
            ) : (
              <div className="schedule-empty">
                <strong>No schedule items yet.</strong>
                <p>Admins are still building {selectedDay?.label ?? "this day"}.</p>
              </div>
            )}
            <p className="preview-note">Times shown in America/Los Angeles // Las Vegas local time</p>
          </section>
        </section>
      </div>
    </main>
  );
}

function StatusCard({ accent, number, label, title, detail }: { accent: "cyan" | "pink" | "lime"; number: string; label: string; title: string; detail: string }) {
  return <article className={`status-card accent-${accent}`}><div className="status-card-top"><span>{label}</span><small>{number}</small></div><strong>{title}</strong><p>{detail}</p></article>;
}

function EventTime({ start, end, timezone }: { start: Date; end: Date; timezone: string }) {
  return <div className="game-time"><strong>{formatInTimeZone(start, timezone, "HH:mm")}</strong><span>{formatInTimeZone(end, timezone, "HH:mm")}</span></div>;
}

function coreDayNumber(allDays: { isCoreDay: boolean }[], index: number): number {
  return allDays.slice(0, index + 1).filter((day) => day.isCoreDay).length;
}

function formatDayHeading(date: string): string {
  return formatInTimeZone(`${date}T12:00:00Z`, "UTC", "EEEE");
}

function formatPhase(value: string): string {
  return value.replaceAll("_", " ");
}

function formatLocation(game: Extract<ScheduleEvent, { kind: "game" }>): string {
  if (game.tableLabel) return game.tableLabel;
  if (game.tableNumber) return `T-${String(game.tableNumber).padStart(2, "0")}`;
  return game.locationNote ?? "TBD";
}

function lotteryStatus(phase: string): string {
  if (phase === "SETUP") return "Rankings open soon";
  if (phase === "LOTTERY_SIGNUP") return "Rankings open";
  if (phase === "LOTTERY_DRAFT") return "Draft under review";
  return "Results published";
}

function signupStatus(phase: string): string {
  return ["ATTENDEE_SIGNUP", "TABLE_ASSIGNMENT", "LIVE"].includes(phase) ? "Open" : "Not started";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
