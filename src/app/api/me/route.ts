import { ApiError, json, rateLimit, route, str } from "@/lib/server/api";
import { endSession, requireUser } from "@/lib/server/auth";
import { deleteAccount, toMe, updateProfile } from "@/lib/server/service";

/** Edit profile (name, bio, status, pronouns, photo) and preferences, including privacy. */
export const PATCH = route(async (req) => {
  const me = await requireUser();
  const b = await json(req);
  return { me: updateProfile(me.id, {
    displayName: str(b.displayName, 40),
    bio: typeof b.bio === "string" ? str(b.bio, 140) : undefined,
    status: typeof b.status === "string" ? str(b.status, 60) : undefined,
    pronouns: typeof b.pronouns === "string" ? str(b.pronouns, 24) : undefined,
    avatar: b.avatar === null ? null : typeof b.avatar === "string" ? b.avatar : undefined,
    prefs: b.prefs,
  }) };
});

export const GET = route(async () => ({ me: toMe((await requireUser()).id) }));

/** Permanently delete the account (requires the password). */
export const DELETE = route(async (req) => {
  const me = await requireUser();
  rateLimit(`delete:${me.id}`, 5, 10 * 60_000);
  const b = await json(req);
  if (typeof b.password !== "string") throw new ApiError(400, "Enter your password to confirm");
  deleteAccount(me.id, b.password);
  await endSession();
});
