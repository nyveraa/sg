import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { removeFriend } from "@/lib/server/service";

/** Unfriend: removes the friendship both ways and deletes the DM. */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/friends/[id]">) => {
  removeFriend((await requireUser()).id, (await ctx.params).id);
});
