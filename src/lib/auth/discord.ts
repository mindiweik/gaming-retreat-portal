import { createHash, randomBytes } from "node:crypto";

export const OAUTH_STATE_COOKIE = "discord_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "discord_oauth_verifier";
export const OAUTH_COOKIE_MAX_AGE = 10 * 60;

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
}

export function createOAuthAttempt(): {
  state: string;
  verifier: string;
  challenge: string;
} {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function getDiscordAuthorizationUrl(state: string, challenge: string): URL {
  const clientId = requiredEnv("DISCORD_CLIENT_ID");
  const redirectUri = requiredEnv("DISCORD_REDIRECT_URI");
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function exchangeDiscordCode(code: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: requiredEnv("DISCORD_CLIENT_ID"),
    client_secret: requiredEnv("DISCORD_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: requiredEnv("DISCORD_REDIRECT_URI"),
    code_verifier: verifier,
  });
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Discord token exchange failed (${response.status})`);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("access_token" in value)) {
    throw new Error("Discord token response did not include an access token");
  }
  const accessToken = (value as { access_token: unknown }).access_token;
  if (typeof accessToken !== "string") throw new Error("Discord access token was invalid");
  return accessToken;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Discord user lookup failed (${response.status})`);
  const value: unknown = await response.json();
  if (!isDiscordUser(value)) throw new Error("Discord returned an invalid user profile");
  return value;
}

export function isAdminDiscordId(discordId: string): boolean {
  return (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(discordId);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function isDiscordUser(value: unknown): value is DiscordUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    (user.global_name === null || typeof user.global_name === "string")
  );
}
