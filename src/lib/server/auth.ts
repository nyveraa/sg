import crypto from "node:crypto";
import { cookies } from "next/headers";
import { one, run } from "./db";
import { ApiError } from "./api";
import { toUser } from "./service";

const COOKIE = "onyx_session";
const TTL = 1000 * 60 * 60 * 24 * 30;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function startSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)", sha(token), userId, Date.now() + TTL);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL / 1000,
  });
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
  const u = await currentUser();
  if (!u) throw new ApiError(401, "Not signed in");
  return u;
}
