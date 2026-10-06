import { json, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { setNickname } from "@/lib/server/service";

/** A private alias only you see. Empty string removes it. */
export const PUT = route(async (req, ctx: RouteContext<"/api/nicknames/[id]">) => {
  const me = await requireUser();
  const b = await json(req);
  return { nicknames: setNickname(me.id, (await ctx.params).id, str(b.nickname, 40)) };
});
