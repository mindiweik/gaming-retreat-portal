import { getSessionUser } from "@/lib/auth/session";

interface HomeProps {
  searchParams: Promise<{ authError?: string }>;
}

const schedule = [
  {
    time: "10:00",
    end: "12:30",
    title: "Signal Lost",
    system: "Mothership",
    host: "Alex R.",
    table: "T-08",
    tone: "cyan",
  },
  {
    time: "13:30",
    end: "16:00",
    title: "The Long Night",
    system: "Call of Cthulhu",
    host: "Jamie K.",
    table: "T-14",
    tone: "pink",
  },
  {
    time: "16:30",
    end: "18:30",
    title: "Goblin Market",
    system: "D&D 5E",
    host: "Morgan S.",
    table: "T-03",
    tone: "lime",
  },
] as const;

export default async function Home({ searchParams }: HomeProps) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  const authConfigured = Boolean(
    process.env.DISCORD_CLIENT_ID &&
      process.env.DISCORD_CLIENT_SECRET &&
      process.env.DISCORD_REDIRECT_URI,
  );

  return (
    <main className="portal-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Gaming Retreat home">
          <span className="brand-mark" aria-hidden="true">
            GR
          </span>
          <span>
            <strong>Gaming Retreat</strong>
            <small>Player Portal // 2027</small>
          </span>
        </a>

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
                <span>
                  <small>{user.role}</small>
                  <strong>{user.name}</strong>
                </span>
              </div>
              <form action="/api/auth/logout" method="post">
                <button className="sign-out-button" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : null}
        </div>
      </header>

      <div className="dashboard">
        <aside className="sidebar" aria-label="Retreat days">
          <p className="eyebrow">Retreat days</p>
          <div className="day-list">
            <button type="button">
              <span>THU</span>
              <strong>10</strong>
              <small>Bookend</small>
            </button>
            <button className="selected" type="button">
              <span>FRI</span>
              <strong>11</strong>
              <small>Day 01</small>
            </button>
            <button type="button">
              <span>SAT</span>
              <strong>12</strong>
              <small>Day 02</small>
            </button>
            <button type="button">
              <span>SUN</span>
              <strong>13</strong>
              <small>Day 03</small>
            </button>
          </div>
          <div className="sidebar-status">
            <span className="status-light" aria-hidden="true" />
            <div>
              <small>Portal status</small>
              <strong>Setup mode</strong>
            </div>
          </div>
        </aside>

        <section className="content" id="schedule">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">Friday // Core day 01</p>
              <h1>{user ? `Ready, ${user.name}?` : "Your weekend. Your games."}</h1>
              <p className="lede">
                Build a schedule, rank featured sessions, and never lose track of your table.
              </p>
            </div>

            {!user ? (
              <div className="login-panel">
                {params.authError ? (
                  <p role="alert" className="auth-error">
                    Sign-in failed ({params.authError}). Check the configuration and try again.
                  </p>
                ) : null}
                {authConfigured ? (
                  <a className="primary-button" href="/api/auth/login">
                    <span aria-hidden="true">◈</span> Continue with Discord
                  </a>
                ) : (
                  <p>Discord sign-in appears after local credentials are configured.</p>
                )}
                {process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_LOGIN_DISCORD_ID ? (
                  <a className="secondary-button" href="/api/auth/dev">Local dev login</a>
                ) : null}
              </div>
            ) : (
              <a className="primary-button" href="#lottery">View lottery status <span>→</span></a>
            )}
          </div>

          <div className="status-grid" id="lottery">
            <article className="status-card accent-cyan">
              <div className="status-card-top"><span>Lottery</span><small>01</small></div>
              <strong>Rankings open soon</strong>
              <p>Featured games are still being loaded.</p>
            </article>
            <article className="status-card accent-pink">
              <div className="status-card-top"><span>My games</span><small>02</small></div>
              <strong>0 confirmed</strong>
              <p>Your assigned sessions will appear here.</p>
            </article>
            <article className="status-card accent-lime">
              <div className="status-card-top"><span>Open signup</span><small>03</small></div>
              <strong>Not started</strong>
              <p>Attendee-led games open after results.</p>
            </article>
          </div>

          <section className="schedule-panel" id="games">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Schedule preview</p>
                <h2>Friday lineup</h2>
              </div>
              <div className="legend" aria-label="Game type legend">
                <span><i className="legend-featured" /> Featured</span>
                <span><i className="legend-attendee" /> Attendee-led</span>
              </div>
            </div>

            <div className="schedule-board">
              <div className="time-rail" aria-hidden="true">
                <span>10 AM</span>
                <span>12 PM</span>
                <span>2 PM</span>
                <span>4 PM</span>
                <span>6 PM</span>
              </div>
              <div className="game-list">
                {schedule.map((game, index) => (
                  <article className={`game-card tone-${game.tone}`} key={game.title}>
                    <div className="game-number">0{index + 1}</div>
                    <div className="game-time">
                      <strong>{game.time}</strong>
                      <span>{game.end}</span>
                    </div>
                    <div className="game-info">
                      <div className="game-tags">
                        <span>Featured</span>
                        <span>{game.system}</span>
                      </div>
                      <h3>{game.title}</h3>
                      <p>Hosted by {game.host}</p>
                    </div>
                    <div className="table-code">
                      <small>Table</small>
                      <strong>{game.table}</strong>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <p className="preview-note">Demo schedule data shown while retreat setup is in progress.</p>
          </section>
        </section>
      </div>
    </main>
  );
}
