import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const discordId = process.env.DEV_AUTO_LOGIN_DISCORD_ID;
  if (!discordId) {
    return new NextResponse("DEV_AUTO_LOGIN_DISCORD_ID is not configured", { status: 400 });
  }

  const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "").split(",").map((id) => id.trim());
  await createSession({
    id: `dev:${discordId}`,
    name: "Local Admin",
    role: adminIds.includes(discordId) ? "ADMIN" : "USER",
    discordHandle: "local-dev",
  });
  return NextResponse.redirect(new URL("/", request.url));
}
