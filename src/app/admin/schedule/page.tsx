import { and, asc, eq, inArray } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";

import {
  deleteCalendarBlockAction,
  deleteDayAction,
  deleteFeaturedGameAction,
  saveCalendarBlockAction,
  saveDayAction,
  saveFeaturedGameAction,
} from "./actions";
import { getDb } from "@/db";
import { getCurrentPhase } from "@/db/phase";
import { calendarBlocks, days, games, retreats, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

interface SchedulePageProps {
  searchParams: Promise<{
    editDay?: string;
    editBlock?: string;
    editGame?: string;
    saved?: string;
    deleted?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDb();
  const [retreat] = await db.select().from(retreats).limit(1);
  if (!retreat) throw new Error("Retreat is not configured");

  const retreatDays = await db.select().from(days).where(eq(days.retreatId, retreat.id)).orderBy(asc(days.date));
  const dayIds = retreatDays.map((day) => day.id);
  const blocks = dayIds.length
    ? await db.select().from(calendarBlocks).where(inArray(calendarBlocks.dayId, dayIds)).orderBy(asc(calendarBlocks.startTime))
    : [];
  const featuredGames = dayIds.length
    ? await db
        .select()
        .from(games)
        .where(and(inArray(games.dayId, dayIds), eq(games.kind, "FEATURED")))
        .orderBy(asc(games.startTime))
    : [];
  const gms = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(inArray(users.role, ["GM", "ADMIN"]))
    .orderBy(asc(users.name));
  const phase = await getCurrentPhase();
  const isEditable = phase === "SETUP";

  const editingDay = retreatDays.find((day) => day.id === params.editDay);
  const editingBlock = blocks.find((block) => block.id === params.editBlock);
  const editingGame = featuredGames.find((game) => game.id === params.editGame);
  const dayById = new Map(retreatDays.map((day) => [day.id, day]));
  const gmById = new Map(gms.map((gm) => [gm.id, gm.name]));

  return (
    <main className="admin-shell schedule-admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Control room // Schedule</p>
          <h1>Build the retreat</h1>
          <p className="admin-subtitle">All entered times use {retreat.timezone.replaceAll("_", " ")}.</p>
        </div>
        <div className="admin-header-actions">
          <span className={isEditable ? "setup-unlocked" : "setup-locked"}>{isEditable ? "Setup unlocked" : `${phase} // locked`}</span>
          <Link className="secondary-button" href="/admin">Operations</Link>
        </div>
      </header>

      {params.saved ? <p className="admin-flash">{formatKind(params.saved)} saved.</p> : null}
      {params.deleted ? <p className="admin-flash">{formatKind(params.deleted)} deleted.</p> : null}
      {!isEditable ? <p className="admin-warning">Schedule editing is available only during SETUP.</p> : null}

      <section className="schedule-editor-grid">
        <EditorPanel title={editingDay ? "Edit day" : "Add day"} eyebrow="01 // Days">
          <form className="compact-form" action={saveDayAction}>
            <input name="id" type="hidden" value={editingDay?.id ?? ""} />
            <label>Date<input defaultValue={editingDay?.date ?? retreat.startDate} disabled={!isEditable} name="date" required type="date" /></label>
            <label>Label<input defaultValue={editingDay?.label ?? ""} disabled={!isEditable} maxLength={100} name="label" placeholder="Day 1 - Friday" required /></label>
            <label className="checkbox-label"><input defaultChecked={editingDay?.isCoreDay ?? false} disabled={!isEditable} name="isCoreDay" type="checkbox" /> Core lottery day</label>
            <FormButtons editing={Boolean(editingDay)} enabled={isEditable} />
          </form>
        </EditorPanel>

        <EditorPanel title={editingBlock ? "Edit calendar block" : "Add calendar block"} eyebrow="02 // Context">
          <form className="compact-form" action={saveCalendarBlockAction}>
            <input name="id" type="hidden" value={editingBlock?.id ?? ""} />
            <DaySelect days={retreatDays} disabled={!isEditable} name="dayId" value={editingBlock?.dayId} />
            <label>Label<input defaultValue={editingBlock?.label ?? ""} disabled={!isEditable} name="label" placeholder="Dinner" required /></label>
            <label>Type<select defaultValue={editingBlock?.type ?? "MEAL"} disabled={!isEditable} name="type"><option value="BREAKFAST">Breakfast</option><option value="MEAL">Meal</option><option value="COCKTAIL_HOUR">Cocktail hour</option><option value="OTHER">Other</option></select></label>
            <TimeFields start={editingBlock ? formatTime(editingBlock.startTime, retreat.timezone) : "18:00"} end={editingBlock ? formatTime(editingBlock.endTime, retreat.timezone) : "19:00"} disabled={!isEditable} />
            <FormButtons editing={Boolean(editingBlock)} enabled={isEditable} />
          </form>
        </EditorPanel>
      </section>

      <section className="schedule-editor-grid game-editor-row">
        <EditorPanel title={editingGame ? "Edit featured game" : "Add featured game"} eyebrow="03 // Featured games">
          <form className="compact-form game-form" action={saveFeaturedGameAction}>
            <input name="id" type="hidden" value={editingGame?.id ?? ""} />
            <DaySelect days={retreatDays.filter((day) => day.isCoreDay)} disabled={!isEditable} name="dayId" value={editingGame?.dayId} />
            <div className="form-row"><label>Title<input defaultValue={editingGame?.title ?? ""} disabled={!isEditable} name="title" required /></label><label>System<input defaultValue={editingGame?.system ?? ""} disabled={!isEditable} name="system" placeholder="Call of Cthulhu" required /></label></div>
            <label>Description<textarea defaultValue={editingGame?.description ?? ""} disabled={!isEditable} maxLength={5000} name="description" required rows={4} /></label>
            <TimeFields start={editingGame ? formatTime(editingGame.startTime, retreat.timezone) : "10:00"} end={editingGame ? formatTime(editingGame.endTime, retreat.timezone) : "13:00"} disabled={!isEditable} />
            <div className="form-row seats-row"><label>Min seats<input defaultValue={editingGame?.minSeats ?? 4} disabled={!isEditable} max={100} min={0} name="minSeats" required type="number" /></label><label>Max seats<input defaultValue={editingGame?.maxSeats ?? 6} disabled={!isEditable} max={100} min={1} name="maxSeats" required type="number" /></label><label>GM<select defaultValue={editingGame?.gmUserId ?? ""} disabled={!isEditable} name="gmUserId"><option value="">Unassigned</option>{gms.map((gm) => <option key={gm.id} value={gm.id}>{gm.name} ({gm.role})</option>)}</select></label></div>
            <label>Location note <span>Optional</span><input defaultValue={editingGame?.locationNote ?? ""} disabled={!isEditable} name="locationNote" placeholder="Table assigned later" /></label>
            <FormButtons editing={Boolean(editingGame)} enabled={isEditable} />
          </form>
        </EditorPanel>
      </section>

      <section className="schedule-data-grid">
        <DataPanel title="Retreat days" count={retreatDays.length}>
          {retreatDays.map((day) => <DataRow key={day.id} title={day.label} meta={`${formatDate(day.date)} // ${day.isCoreDay ? "Core" : "Bookend"}`} editHref={`/admin/schedule?editDay=${day.id}`} id={day.id} deleteAction={deleteDayAction} enabled={isEditable} />)}
        </DataPanel>
        <DataPanel title="Calendar blocks" count={blocks.length}>
          {blocks.map((block) => <DataRow key={block.id} title={block.label} meta={`${dayById.get(block.dayId)?.label ?? "Unknown day"} // ${formatTime(block.startTime, retreat.timezone)}–${formatTime(block.endTime, retreat.timezone)}`} editHref={`/admin/schedule?editBlock=${block.id}`} id={block.id} deleteAction={deleteCalendarBlockAction} enabled={isEditable} />)}
        </DataPanel>
        <DataPanel title="Featured games" count={featuredGames.length}>
          {featuredGames.map((game) => <DataRow key={game.id} title={game.title} meta={`${dayById.get(game.dayId)?.label ?? "Unknown day"} // ${game.system} // ${formatTime(game.startTime, retreat.timezone)} // GM: ${game.gmUserId ? gmById.get(game.gmUserId) ?? "Unknown" : "TBD"}`} editHref={`/admin/schedule?editGame=${game.id}`} id={game.id} deleteAction={deleteFeaturedGameAction} enabled={isEditable} />)}
        </DataPanel>
      </section>
    </main>
  );
}

function EditorPanel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <article className="admin-panel editor-panel"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children}</article>;
}
function DaySelect({ days, name, value, disabled }: { days: { id: string; label: string }[]; name: string; value?: string; disabled: boolean }) {
  return <label>Day<select defaultValue={value ?? days[0]?.id ?? ""} disabled={disabled} name={name} required>{days.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}</select></label>;
}
function TimeFields({ start, end, disabled }: { start: string; end: string; disabled: boolean }) {
  return <div className="form-row"><label>Start<input defaultValue={start} disabled={disabled} name="startTime" required type="time" /></label><label>End<input defaultValue={end} disabled={disabled} name="endTime" required type="time" /></label></div>;
}
function FormButtons({ editing, enabled }: { editing: boolean; enabled: boolean }) {
  return <div className="form-actions"><button className="primary-button" disabled={!enabled} type="submit">{editing ? "Save changes" : "Add"}</button>{editing ? <Link className="secondary-button" href="/admin/schedule">Cancel edit</Link> : null}</div>;
}
function DataPanel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <article className="admin-panel data-panel"><div className="data-panel-heading"><h2>{title}</h2><span>{count}</span></div><div className="data-list">{count ? children : <p className="empty-state">Nothing added yet.</p>}</div></article>;
}
function DataRow({ title, meta, editHref, id, deleteAction, enabled }: { title: string; meta: string; editHref: string; id: string; deleteAction: (formData: FormData) => Promise<void>; enabled: boolean }) {
  return <div className="data-row"><div><strong>{title}</strong><small>{meta}</small></div>{enabled ? <div className="row-actions"><Link href={editHref}>Edit</Link><details><summary>Delete</summary><form action={deleteAction}><input name="id" type="hidden" value={id} /><input aria-label={`Type DELETE to remove ${title}`} name="confirmation" placeholder="DELETE" required /><button type="submit">Confirm</button></form></details></div> : null}</div>;
}
function formatTime(value: Date, timezone: string) { return formatInTimeZone(value, timezone, "HH:mm"); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function formatKind(value: string) { return value === "block" ? "Calendar block" : value.charAt(0).toUpperCase() + value.slice(1); }
