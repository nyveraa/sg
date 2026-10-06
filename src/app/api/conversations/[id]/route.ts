import { json, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { renameGroup } from "@/lib/server/service";

export const PATCH = route(async (req, ctx: RouteContext<"/api/conversations/[id]">) => {
  const me = await requireUser();
  const b = await json(req);
  renameGroup(me.id, (await ctx.params).id, str(b.title, 40));
});
