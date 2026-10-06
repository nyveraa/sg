import { json, route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { actOnMessage } from "@/lib/server/service";

/** Poll votes ({option}) and Tic-Tac-Toe moves ({cell}). */
export const POST = route(async (req, ctx: RouteContext<"/api/messages/[id]/act">) => {
  const me = await requireUser();
  const b = await json(req);
  return { message: actOnMessage(me.id, Number((await ctx.params).id), {
    option: typeof b.option === "number" ? b.option : undefined,
    cell: typeof b.cell === "number" ? b.cell : undefined,
    col: typeof b.col === "number" ? b.col : undefined,
    pick: typeof b.pick === "string" ? b.pick : undefined,
  }) };
});
