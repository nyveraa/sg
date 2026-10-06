import { json, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { updateProfile } from "@/lib/server/service";

export const PATCH = route(async (req) => {
  const me = await requireUser();
  const b = await json(req);
  return { user: updateProfile(me.id, {
    displayName: str(b.displayName, 40),
    bio: typeof b.bio === "string" ? str(b.bio, 140) : undefined,
    hue: typeof b.hue === "number" ? b.hue : undefined,
  }) };
});
