import { asc, count, eq } from "drizzle-orm";
import Link from "next/link";

import { advancePhaseAction } from "./actions";
import { getDb } from "@/db";
import { PHASE_ORDER } from "@/db/phase";
import {
  calendarBlocks,
  days,
  games,
  phaseState,
  registrations,
  retreats,
  users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const db = getDb();
  const [retreat] = await db.select().from(retreats).orderBy(asc(retreats.startDate)).limit(1);
  const retreatDays = retreat
    ? await db.select().from(days).where(eq(days.retreatId, retreat.id)).orderBy(asc(days.date))
    : [];
  const [phase] = await db.select().from(phaseState).where(eq(phaseState.id, 1)).limit(1);
  const [[userCount], [gameCount], [blockCount], [registrationCount]] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(games),
    db.select({ value: count() }).from(calendarBlocks),
    db.select({ value: count() }).from(registrations),
  ]);

  if (!phase) throw new Error("Phase state is not configured. Run the database seed.");
  const phaseIndex = PHASE_ORDER.indexOf(phase.current);
  const nextPhase = PHASE_ORDER[phaseIndex + 1];

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Control room // Admin only</p>
          <h1>Retreat operations</h1>
        </div>
        <div className="admin-header-actions">
          <span>Signed in as {admin.name}</span>
          <Link className="secondary-button" href="/">Back to portal</Link>
        </div>
      </header>

      <section className="admin-grid">
        <article className="admin-panel phase-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Global state</p>
              <h2>Current phase</h2>
            </div>
            <span className="phase-badge">{formatPhase(phase.current)}</span>
          </div>

          <ol className="phase-track">
            {PHASE_ORDER.map((item, index) => (
              <li
                className={index < phaseIndex ? "complete" : index === phaseIndex ? "current" : "pending"}
                key={item}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{formatPhase(item)}</strong>
              </li>
            ))}
          </ol>

          {nextPhase ? (
            <form className="phase-form" action={advancePhaseAction}>
              <input name="expectedCurrent" type="hidden" value={phase.current} />
              <input name="next" type="hidden" value={nextPhase} />
              <label htmlFor="phase-confirmation">
                Type <strong>ADVANCE</strong> to move to {formatPhase(nextPhase)}
              </label>
              <div>
                <input
                  autoComplete="off"
                  id="phase-confirmation"
                  name="confirmation"
                  placeholder="ADVANCE"
                  required
                />
                <button className="danger-button" type="submit">Advance phase</button>
              </div>
              <p>Phase changes are forward-only. This prevents rankings or results from reopening accidentally.</p>
            </form>
          ) : (
            <p className="phase-complete">The retreat is LIVE. No later phase is configured.</p>
          )}
        </article>

        <article className="admin-panel retreat-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Event setup</p>
              <h2>{retreat?.name ?? "No retreat configured"}</h2>
            </div>
            {retreat ? <span className="date-range">{formatDate(retreat.startDate)}—{formatDate(retreat.endDate)}</span> : null}
          </div>
          <div className="admin-day-list">
            {retreatDays.map((day) => (
              <div key={day.id}>
                <time dateTime={day.date}>{formatDate(day.date)}</time>
                <strong>{day.label}</strong>
                <span className={day.isCoreDay ? "core-day" : "bookend-day"}>
                  {day.isCoreDay ? "Core day" : "Bookend"}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-stats" aria-label="Setup statistics">
        <StatCard label="People" value={userCount?.value ?? 0} accent="blue" />
        <StatCard label="Games" value={gameCount?.value ?? 0} accent="red" />
        <StatCard label="Calendar blocks" value={blockCount?.value ?? 0} accent="blue" />
        <StatCard label="Registrations" value={registrationCount?.value ?? 0} accent="red" />
      </section>

      <section className="admin-panel admin-next">
        <div>
          <p className="eyebrow">Next setup tasks</p>
          <h2>Build the schedule</h2>
          <Link className="primary-button" href="/admin/schedule">Open schedule editor</Link>
        </div>
        <ul>
          <li><span>01</span> Add meals and calendar blocks</li>
          <li><span>02</span> Add featured games and GMs</li>
          <li><span>03</span> Review capacity before opening rankings</li>
        </ul>
      </section>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: "blue" | "red" }) {
  return (
    <article className={`admin-stat stat-${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatPhase(phase: string): string {
  return phase.replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
