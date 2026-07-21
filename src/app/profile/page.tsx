import { eq } from "drizzle-orm";
import Link from "next/link";

import { updateProfileAction } from "./actions";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/auth/session";

interface ProfilePageProps {
  searchParams: Promise<{ saved?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const session = await requireAuth();
  const params = await searchParams;
  const [user] = await getDb().select().from(users).where(eq(users.id, session.id)).limit(1);
  if (!user) throw new Error("User profile was not found");

  return (
    <main className="form-page-shell">
      <header className="form-page-header">
        <div>
          <p className="eyebrow">Player record</p>
          <h1>Your profile</h1>
          <p>Keep contact details current so GMs and co-players can coordinate when needed.</p>
        </div>
        <Link className="secondary-button" href="/">Back to portal</Link>
      </header>

      <section className="form-layout">
        <form className="editor-form" action={updateProfileAction}>
          {params.saved === "1" ? <p className="success-message">Profile saved.</p> : null}
          <label>
            Display name
            <input defaultValue={user.name} maxLength={100} name="name" required />
          </label>
          <label>
            Discord handle
            <input defaultValue={user.discordHandle ?? ""} disabled />
            <small>Synced from Discord when you sign in.</small>
          </label>
          <div className="form-row">
            <label>
              Email <span>Optional</span>
              <input defaultValue={user.email ?? ""} inputMode="email" name="email" type="email" />
            </label>
            <label>
              Phone <span>Optional</span>
              <input defaultValue={user.phone ?? ""} inputMode="tel" maxLength={40} name="phone" type="tel" />
            </label>
          </div>
          <label>
            Bio <span>Optional</span>
            <textarea defaultValue={user.bio ?? ""} maxLength={1000} name="bio" rows={7} />
          </label>
          <button className="primary-button" type="submit">Save profile</button>
        </form>

        <aside className="privacy-note">
          <p className="eyebrow">Contact privacy</p>
          <h2>Who sees what?</h2>
          <ul>
            <li><strong>Name + Discord handle</strong><span>Visible to retreat attendees.</span></li>
            <li><strong>Email + phone</strong><span>Only admins and GMs/players in a shared game.</span></li>
            <li><strong>Bio</strong><span>Visible on your attendee profile.</span></li>
          </ul>
          <p>Private fields are filtered at the query layer and are never sent to unrelated attendees.</p>
        </aside>
      </section>
    </main>
  );
}
