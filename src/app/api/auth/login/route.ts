import { ApiError, json, rateLimit, route, str } from "@/lib/server/api";
import { startSession } from "@/lib/server/auth";
import { verifyPassword } from "@/lib/server/password";
import { findLogin, toUser } from "@/lib/server/service";

export const POST = route(async (req) => {
  const b = await json(req);
  const username = str(b.username, 20).toLowerCase();
  rateLimit(`login:${username}`, 8, 10 * 60_000);
  const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
  const row = findLogin(username);
  // Same message for unknown user and wrong password.
  if (!row || !verifyPassword(password, row.pass_salt, row.pass_hash)) throw new ApiError(401, "Wrong username or password");
  await startSession(row.id);
  return { user: toUser(row.id) };
});
