import { json, rateLimit, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { addComment, listComments } from "@/lib/server/service";

export const GET = route(async (_req, ctx: RouteContext<"/api/posts/[id]/comments">) => ({
  comments: listComments((await requireUser()).id, Number((await ctx.params).id)),
}));

export const POST = route(async (req, ctx: RouteContext<"/api/posts/[id]/comments">) => {
  const me = await requireUser();
  rateLimit(`comment:${me.id}`, 60, 60 * 60_000);
  const b = await json(req);
  return { comment: addComment(me.id, Number((await ctx.params).id), str(b.body, 500)) };
});
