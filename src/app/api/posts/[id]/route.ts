import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { deletePost } from "@/lib/server/service";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/posts/[id]">) => {
  deletePost((await requireUser()).id, Number((await ctx.params).id));
});
