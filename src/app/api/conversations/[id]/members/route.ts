import { json, route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { addGroupMembers } from "@/lib/server/service";

export const POST = route(async (req, ctx: RouteContext<"/api/conversations/[id]/members">) => {
  const me = await requireUser();
  const b = await json(req);
  const ids = Array.isArray(b.userIds) ? b.userIds.filter((x): x is string => typeof x === "string") : [];
  addGroupMembers(me.id, (await ctx.params).id, ids);
});
