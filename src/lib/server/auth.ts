import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { one, run } from "./db";
import { ApiError } from "./api";
import { toUser, touchSeen } from "./service";

const COOKIE = "onyx_session";
const TTL = 1000 * 60 * 60 * 24 * 180;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** `secure` follows the real protocol (behind a proxy too), so a plain-http LAN/test setup still keeps its cookie. */
async function setCookie(token: string) {
  const https = (await headers()).get("x-forwarded-proto") === "https" || process.env.RENDER === "true";
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: https && process.env.NODE_ENV === "production", path: "/", maxAge: TTL / 1000,
  });
}

export async function startSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)", sha(token), userId, Date.now() + TTL);
  await setCookie(token);
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", sha(token));
  jar.delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = one<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?", sha(token), Date.now());
  return row ? toUser(row.user_id) : null;
}

export async function requireUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  const row = token ? one<{ user_id: string; expires_at: number }>(
    "SELECT user_id, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?", sha(token), Date.now()) : undefined;
  const u = row ? toUser(row.user_id) : null;
  if (!row || !token || !u) throw new ApiError(401, "Not signed in");
  touchSeen(u.id); // feeds "last active"
  // Stay signed in while you keep using it: push the expiry out once a day of use.
  if (row.expires_at - Date.now() < TTL - 86_400_000) {
    run("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", Date.now() + TTL, sha(token));
    await setCookie(token);
  }
  return u;
}
