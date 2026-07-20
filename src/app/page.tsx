import { getSessionUser } from "@/lib/auth/session";

interface HomeProps {
  searchParams: Promise<{ authError?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  const authConfigured = Boolean(
    process.env.DISCORD_CLIENT_ID &&
      process.env.DISCORD_CLIENT_SECRET &&
      process.env.DISCORD_REDIRECT_URI,
  );

  return (
    <main className="min-h-screen bg-[#f5f0e6] text-[#26231f]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between border-b border-[#cfc5b5] pb-5">
          <p className="font-semibold tracking-[0.16em] uppercase">Gaming Retreat</p>
          {user ? (
            <form action="/api/auth/logout" method="post">
              <button className="rounded-full border border-[#5d574f] px-4 py-2 text-sm font-medium hover:bg-white/60">
                Sign out
              </button>
            </form>
          ) : null}
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.35fr_0.65fr]">
          <div>
            <p className="mb-5 text-sm font-bold tracking-[0.2em] text-[#9b3f2f] uppercase">
              June 2027
            </p>
            <h1 className="max-w-3xl font-serif text-5xl leading-[0.98] tracking-tight sm:text-7xl">
              Find your table. Build your perfect weekend.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#5d574f]">
              Browse featured games, rank your choices, propose a session, and keep your whole
              retreat schedule in one place.
            </p>

            {params.authError ? (
              <p role="alert" className="mt-6 rounded-lg border border-[#b74a3a] bg-[#fff2ee] p-4 text-sm">
                Sign-in did not complete ({params.authError}). Check the local configuration and try again.
              </p>
            ) : null}

            <div className="mt-9 flex flex-wrap gap-3">
              {user ? (
                <div className="rounded-xl bg-[#253a35] px-5 py-4 text-[#f7f3ea]">
                  <p className="text-sm text-[#c7d2cd]">Signed in as</p>
                  <p className="text-lg font-semibold">{user.name}</p>
                  <p className="text-sm text-[#c7d2cd]">{user.role}</p>
                </div>
              ) : authConfigured ? (
                <a
                  href="/api/auth/login"
                  className="rounded-full bg-[#253a35] px-6 py-3 font-semibold text-white hover:bg-[#345047]"
                >
                  Continue with Discord
                </a>
              ) : (
                <p className="rounded-lg border border-[#cfc5b5] bg-white/50 px-5 py-3 text-sm text-[#5d574f]">
                  Discord sign-in will appear after local credentials are configured.
                </p>
              )}

              {process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_LOGIN_DISCORD_ID ? (
                <a
                  href="/api/auth/dev"
                  className="rounded-full border border-[#5d574f] px-6 py-3 font-semibold hover:bg-white/60"
                >
                  Local dev login
                </a>
              ) : null}
            </div>
          </div>

          <aside className="rounded-2xl border border-[#cfc5b5] bg-white/55 p-7 shadow-[0_24px_70px_rgba(57,47,35,0.08)]">
            <p className="text-xs font-bold tracking-[0.18em] text-[#9b3f2f] uppercase">Foundation</p>
            <h2 className="mt-3 font-serif text-3xl">Build status</h2>
            <ul className="mt-6 space-y-4 text-sm leading-6 text-[#5d574f]">
              <li>✓ Seeded, reproducible three-pass lottery</li>
              <li>✓ 150-attendee simulation harness</li>
              <li>✓ Discord OAuth + signed-session foundation</li>
              <li>✓ Neon + Drizzle user schema</li>
              <li className="text-[#9b3f2f]">Next: connect Neon and Discord locally</li>
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}
