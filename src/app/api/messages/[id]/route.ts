import { json, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { deleteMessage, editMessage } from "@/lib/server/service";

export const PATCH = route(async (req, ctx: RouteContext<"/api/messages/[id]">) => {
  const me = await requireUser();
  const b = await json(req);
  return { message: editMessage(me.id, Number((await ctx.params).id), str(b.body, 4000)) };
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/messages/[id]">) => {
  const me = await requireUser();
  return { message: deleteMessage(me.id, Number((await ctx.params).id)) };
});
