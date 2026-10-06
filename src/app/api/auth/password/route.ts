import { ApiError, json, rateLimit, route } from "@/lib/server/api";
import { requireUser, startSession } from "@/lib/server/auth";
import { changePassword } from "@/lib/server/service";

/** Change password; every other device is signed out and this one gets a fresh session. */
export const POST = route(async (req) => {
  const me = await requireUser();
  rateLimit(`pw:${me.id}`, 8, 10 * 60_000);
  const b = await json(req);
  if (typeof b.current !== "string" || typeof b.next !== "string") throw new ApiError(400, "Enter your current and new password");
  changePassword(me.id, b.current, b.next);
  await startSession(me.id);
});
