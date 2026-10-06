import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { markRead } from "@/lib/server/service";

export const POST = route(async (_req, ctx: RouteContext<"/api/conversations/[id]/read">) => {
  markRead((await requireUser()).id, (await ctx.params).id);
});
