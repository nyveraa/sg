import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { leaveGroup } from "@/lib/server/service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/conversations/[id]/members/me">) => {
  leaveGroup((await requireUser()).id, (await ctx.params).id);
});
