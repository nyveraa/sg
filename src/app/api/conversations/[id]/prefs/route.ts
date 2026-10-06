import { json, route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { setConvPrefs } from "@/lib/server/service";

/** Pin / mute / archive a conversation (just for you). */
export const POST = route(async (req, ctx: RouteContext<"/api/conversations/[id]/prefs">) => {
  const me = await requireUser();
  const b = await json(req);
  return { conversation: setConvPrefs(me.id, (await ctx.params).id, {
    pinned: typeof b.pinned === "boolean" ? b.pinned : undefined,
    muted: typeof b.muted === "boolean" ? b.muted : undefined,
    archived: typeof b.archived === "boolean" ? b.archived : undefined,
  }) };
});
