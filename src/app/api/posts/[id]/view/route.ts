import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { recordStoryView } from "@/lib/server/service";

export const POST = route(async (_req, ctx: RouteContext<"/api/posts/[id]/view">) => {
  recordStoryView((await requireUser()).id, Number((await ctx.params).id));
});
