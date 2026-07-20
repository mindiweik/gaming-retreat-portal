import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  exchangeDiscordCode,
  fetchDiscordUser,
  isAdminDiscordId,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from "@/lib/auth/discord";
import { createSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const verifier = cookieStore.get(OAUTH_VERIFIER_COOKIE)?.value;

  cookieStore.delete(OAUTH_STATE_COOKIE);
  cookieStore.delete(OAUTH_VERIFIER_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return NextResponse.redirect(new URL("/?authError=invalid_callback", request.url));
  }

  try {
    const accessToken = await exchangeDiscordCode(code, verifier);
    const discordUser = await fetchDiscordUser(accessToken);
    const role = isAdminDiscordId(discordUser.id) ? "ADMIN" : "USER";
    const name = discordUser.global_name ?? discordUser.username;
    const db = getDb();

    const [user] = await db
      .insert(users)
      .values({
        discordId: discordUser.id,
        discordHandle: discordUser.username,
        name,
        role,
      })
      .onConflictDoUpdate({
        target: users.discordId,
        set: {
          discordHandle: discordUser.username,
          name,
          role,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!user) throw new Error("Discord user could not be persisted");
    await createSession({
      id: user.id,
      name: user.name,
      role: user.role,
      discordHandle: user.discordHandle ?? undefined,
    });
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("Discord OAuth callback failed", error);
    return NextResponse.redirect(new URL("/?authError=callback_failed", request.url));
  }
}
