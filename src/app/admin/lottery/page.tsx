import { and, asc, desc, eq, ne } from "drizzle-orm";
import Link from "next/link";

import { runLotteryDraftAction } from "./actions";
import { getDb } from "@/db";
import {
  days,
  games,
  lotteryDraftAssignments,
  lotteryDraftWaitlistEntries,
  lotteryEntries,
  lotteryRuns,
  phaseState,
  retreats,
  users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

interface AdminLotteryPageProps {
  searchParams: Promise<{ day?: string; run?: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdminLotteryPage({ searchParams }: AdminLotteryPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDb();
  const [retreat] = await db.select().from(retreats).limit(1);
  if (!retreat) throw new Error("Retreat is not configured");

  const coreDays = await db
    .select()
    .from(days)
    .where(and(eq(days.retreatId, retreat.id), eq(days.isCoreDay, true)))
    .orderBy(asc(days.date));
  const selectedDay = coreDays.find((day) => day.id === params.day) ?? coreDays[0];
  const [phase] = await db.select().from(phaseState).where(eq(phaseState.id, 1)).limit(1);
  if (!selectedDay) throw new Error("No core lottery days are configured");

  const [runs, featuredGames, participantRows, entryRows] = await Promise.all([
    db.select().from(lotteryRuns).where(eq(lotteryRuns.dayId, selectedDay.id)).orderBy(desc(lotteryRuns.createdAt)),
    db
      .select({ id: games.id, title: games.title, minSeats: games.minSeats, maxSeats: games.maxSeats })
      .from(games)
      .where(and(eq(games.dayId, selectedDay.id), eq(games.kind, "FEATURED"), eq(games.status, "ACTIVE")))
      .orderBy(asc(games.startTime)),
    db.select({ id: users.id, name: users.name }).from(users).where(ne(users.role, "GM")).orderBy(asc(users.name)),
    db.select({ id: lotteryEntries.id }).from(lotteryEntries).where(eq(lotteryEntries.dayId, selectedDay.id)),
  ]);
  const selectedRun =
    runs.find((run) => run.id === params.run) ?? runs.find((run) => run.status === "DRAFT") ?? runs[0];

  const [assignments, waitlist] = selectedRun
    ? await Promise.all([
        db
          .select({
            id: lotteryDraftAssignments.id,
            userId: lotteryDraftAssignments.userId,
            userName: users.name,
            gameId: lotteryDraftAssignments.gameId,
            gameTitle: games.title,
            pass: lotteryDraftAssignments.pass,
            rank: lotteryDraftAssignments.rank,
          })
          .from(lotteryDraftAssignments)
          .innerJoin(users, eq(lotteryDraftAssignments.userId, users.id))
          .innerJoin(games, eq(lotteryDraftAssignments.gameId, games.id))
          .where(eq(lotteryDraftAssignments.lotteryRunId, selectedRun.id))
          .orderBy(asc(users.name), asc(games.startTime)),
        db
          .select({
            id: lotteryDraftWaitlistEntries.id,
            userName: users.name,
            gameTitle: games.title,
            rank: lotteryDraftWaitlistEntries.rank,
            hasConflict: lotteryDraftWaitlistEntries.hasConflict,
          })
          .from(lotteryDraftWaitlistEntries)
          .innerJoin(users, eq(lotteryDraftWaitlistEntries.userId, users.id))
          .innerJoin(games, eq(lotteryDraftWaitlistEntries.gameId, games.id))
          .where(eq(lotteryDraftWaitlistEntries.lotteryRunId, selectedRun.id))
          .orderBy(asc(games.title), asc(lotteryDraftWaitlistEntries.rank)),
      ])
    : [[], []];

  const assignedUserIds = new Set(assignments.map((assignment) => assignment.userId));
  const gaps = participantRows.filter((participant) => !assignedUserIds.has(participant.id));
  const assignedByGame = new Map<string, number>();
  for (const assignment of assignments) {
    assignedByGame.set(assignment.gameId, (assignedByGame.get(assignment.gameId) ?? 0) + 1);
  }
  const metrics = selectedRun?.metrics ?? {};
  const canRun = phase?.current === "LOTTERY_DRAFT";

  return (
    <main className="admin-shell lottery-admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Control room // Lottery draft</p>
          <h1>Review the draw</h1>
          <p className="admin-subtitle">Drafts stay private until a later approval step publishes registrations.</p>
        </div>
        <div className="admin-header-actions">
          <span className={canRun ? "setup-unlocked" : "setup-locked"}>{formatLabel(phase?.current ?? "SETUP")}</span>
          <Link className="secondary-button" href="/admin">Operations</Link>
        </div>
      </header>

      <nav className="admin-lottery-tabs" aria-label="Core lottery days">
        {coreDays.map((day, index) => (
          <Link className={day.id === selectedDay.id ? "selected" : undefined} href={`/admin/lottery?day=${day.id}`} key={day.id}>
            <span>Day {index + 1}</span><strong>{day.label}</strong>
          </Link>
        ))}
      </nav>

      <section className="admin-panel draft-controls">
        <div>
          <p className="eyebrow">Run controls</p>
          <h2>{selectedDay.label}</h2>
          <p>{participantRows.length} eligible people // {entryRows.length} submitted // {featuredGames.length} games</p>
        </div>
        <form action={runLotteryDraftAction}>
          <input name="dayId" type="hidden" value={selectedDay.id} />
          <label>Seed <span>Optional—blank creates a new seed</span><input defaultValue={selectedRun?.seed ?? ""} disabled={!canRun} max="2147483647" min="0" name="seed" type="number" /></label>
          <button className="primary-button" disabled={!canRun} type="submit">{selectedRun ? "Rerun day" : "Run draft"}</button>
        </form>
        {!canRun ? <p className="admin-warning">Advance to LOTTERY_DRAFT before running. Ranking collection occurs in LOTTERY_SIGNUP.</p> : null}
      </section>

      {selectedRun ? (
        <>
          <section className="draft-summary">
            <Metric label="Avg choice rank" value={numberMetric(metrics, "avgAssignedChoiceRank", 2)} goal={Number(metrics.avgAssignedChoiceRank ?? 0) <= 1.6 ? "Meets 1.6 goal" : "Above 1.6 goal"} />
            <Metric label="Placement rate" value={`${(Number(metrics.placementRate ?? 0) * 100).toFixed(1)}%`} />
            <Metric label="Assignments" value={String(assignments.length)} />
            <Metric label="Unplaced" value={String(gaps.length)} alert={gaps.length > 0} />
            <Metric label="Below minimum" value={String(featuredGames.filter((game) => (assignedByGame.get(game.id) ?? 0) < game.minSeats).length)} />
          </section>

          <section className="admin-panel run-meta">
            <div><span>Status</span><strong>{selectedRun.status}</strong></div>
            <div><span>Seed</span><strong>{selectedRun.seed}</strong></div>
            <div><span>Created</span><strong>{selectedRun.createdAt.toLocaleString("en-US", { timeZone: retreat.timezone })}</strong></div>
            <div className="run-history"><span>Run history</span><div>{runs.map((run) => <Link className={run.id === selectedRun.id ? "selected" : undefined} href={`/admin/lottery?day=${selectedDay.id}&run=${run.id}`} key={run.id}>{`${run.seed} // ${run.status}`}</Link>)}</div></div>
          </section>

          <section className="draft-review-grid">
            <ReviewPanel title="Assignments" count={assignments.length}>
              {assignments.map((assignment) => <div className="review-row" key={assignment.id}><div><strong>{assignment.userName}</strong><small>{assignment.gameTitle}</small></div><span>{formatLabel(assignment.pass)}{assignment.rank ? ` // Rank ${assignment.rank}` : ""}</span></div>)}
            </ReviewPanel>
            <ReviewPanel title="Table health" count={featuredGames.length}>
              {featuredGames.map((game) => { const assigned = assignedByGame.get(game.id) ?? 0; return <div className={`review-row ${assigned < game.minSeats ? "review-alert" : ""}`} key={game.id}><div><strong>{game.title}</strong><small>{`Minimum ${game.minSeats} // Capacity ${game.maxSeats}`}</small></div><span>{assigned} assigned</span></div>; })}
            </ReviewPanel>
            <ReviewPanel title="Gap report" count={gaps.length}>
              {gaps.map((person) => <div className="review-row review-alert" key={person.id}><div><strong>{person.name}</strong><small>No assignment on this day</small></div></div>)}
            </ReviewPanel>
            <ReviewPanel title="Auto-waitlist" count={waitlist.length}>
              {waitlist.map((entry) => <div className={`review-row ${entry.hasConflict ? "review-alert" : ""}`} key={entry.id}><div><strong>{entry.userName}</strong><small>{entry.gameTitle}</small></div><span>Rank {entry.rank}{entry.hasConflict ? " // Conflict" : ""}</span></div>)}
            </ReviewPanel>
          </section>
        </>
      ) : (
        <section className="admin-panel empty-draft"><h2>No draft yet</h2><p>Collect rankings, advance to Lottery Draft, then run this day.</p></section>
      )}
    </main>
  );
}

function Metric({ label, value, goal, alert = false }: { label: string; value: string; goal?: string; alert?: boolean }) { return <article className={`draft-metric ${alert ? "metric-alert" : ""}`}><span>{label}</span><strong>{value}</strong>{goal ? <small>{goal}</small> : null}</article>; }
function ReviewPanel({ title, count: itemCount, children }: { title: string; count: number; children: React.ReactNode }) { return <article className="admin-panel review-panel"><div className="data-panel-heading"><h2>{title}</h2><span>{itemCount}</span></div><div className="review-list">{itemCount ? children : <p className="empty-state">None.</p>}</div></article>; }
function numberMetric(metrics: Record<string, number>, key: string, digits: number) { const value = metrics[key]; return typeof value === "number" ? value.toFixed(digits) : "—"; }
function formatLabel(value: string) { return value.replaceAll("_", " "); }
