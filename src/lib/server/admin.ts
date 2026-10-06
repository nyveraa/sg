import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { ApiError, rateLimit } from "./api";

/**
 * The admin is not a user account: it is whoever knows ONYX_ADMIN_PASSWORD (set it in your host's env).
 * The cookie is a stateless HMAC-signed expiry, so it survives restarts and changing the password signs you out.
 */
const COOKIE = "onyx_admin";
const TTL = 1000 * 60 * 60 * 24 * 7;

const secret = () => process.env.ONYX_ADMIN_PASSWORD ?? "";
export const adminEnabled = () => secret().length >= 8;
const sign = (exp: string) => crypto.createHmac("sha256", `onyx-admin:${secret()}`).update(exp).digest("hex");
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export async function adminLogin(req: NextRequest, password: string) {
  if (!adminEnabled()) throw new ApiError(503, "Admin is disabled — set ONYX_ADMIN_PASSWORD (8+ characters) on the server");
  rateLimit(`admin:${req.headers.get("x-forwarded-for") ?? "local"}`, 6, 15 * 60_000);
  if (!same(crypto.createHash("sha256").update(password).digest("hex"), crypto.createHash("sha256").update(secret()).digest("hex")))
    throw new ApiError(401, "Wrong admin password");
  const exp = String(Date.now() + TTL);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true, sameSite: "strict", secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    path: "/", maxAge: TTL / 1000,
  });
}

export async function adminLogout() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  if (!adminEnabled()) return false;
  const [exp, mac] = ((await cookies()).get(COOKIE)?.value ?? "").split(".");
  return !!exp && !!mac && Number(exp) > Date.now() && same(mac, sign(exp));
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new ApiError(401, "Admin sign-in required");
}
