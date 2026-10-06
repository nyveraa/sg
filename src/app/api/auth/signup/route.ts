import { json, rateLimit, route, str } from "@/lib/server/api";
import { startSession } from "@/lib/server/auth";
import { createUser } from "@/lib/server/service";

export const POST = route(async (req) => {
  rateLimit(`signup:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 10 * 60_000);
  const b = await json(req);
  const username = str(b.username, 20);
  const user = createUser(username, str(b.displayName, 40), typeof b.password === "string" ? b.password.slice(0, 200) : "");
  await startSession(user.id);
  return { user };
});
