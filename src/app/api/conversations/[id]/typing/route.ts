import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { typing } from "@/lib/server/service";

export const POST = route(async (_req, ctx: RouteContext<"/api/conversations/[id]/typing">) => {
  typing((await requireUser()).id, (await ctx.params).id);
});
