import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { storyViews } from "@/lib/server/service";

export const GET = route(async (_req, ctx: RouteContext<"/api/posts/[id]/views">) => ({
  views: storyViews((await requireUser()).id, Number((await ctx.params).id)),
}));
