import { json, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { toggleReaction } from "@/lib/server/service";

export const POST = route(async (req, ctx: RouteContext<"/api/messages/[id]/react">) => {
  const me = await requireUser();
  const b = await json(req);
  return { message: toggleReaction(me.id, Number((await ctx.params).id), str(b.emoji, 16)) };
});
