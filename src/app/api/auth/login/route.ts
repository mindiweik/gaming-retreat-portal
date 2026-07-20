import { NextResponse } from "next/server";

import {
  createOAuthAttempt,
  getDiscordAuthorizationUrl,
  OAUTH_COOKIE_MAX_AGE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from "@/lib/auth/discord";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { state, verifier, challenge } = createOAuthAttempt();
    const response = NextResponse.redirect(getDiscordAuthorizationUrl(state, challenge));
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: OAUTH_COOKIE_MAX_AGE,
    };
    response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
    response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);
    return response;
  } catch (error) {
    console.error("Unable to start Discord OAuth", error);
    return NextResponse.redirect(new URL("/?authError=configuration", getAppUrl()));
  }
}

function getAppUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}
