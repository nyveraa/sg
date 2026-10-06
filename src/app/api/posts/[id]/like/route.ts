import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { togglePostLike } from "@/lib/server/service";

export const POST = route(async (_req, ctx: RouteContext<"/api/posts/[id]/like">) => ({
  post: togglePostLike((await requireUser()).id, Number((await ctx.params).id)),
}));
