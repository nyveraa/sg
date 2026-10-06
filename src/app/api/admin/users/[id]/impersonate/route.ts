import { ApiError, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/admin";
import { startSession } from "@/lib/server/auth";
import { toUser } from "@/lib/server/service";

/** Opens a normal session for that user in this browser — for recovering an account you can't get into. */
export const POST = route<RouteContext<"/api/admin/users/[id]/impersonate">>(async (_req, ctx) => {
  await requireAdmin();
  const id = (await ctx.params).id;
  if (!toUser(id)) throw new ApiError(404, "No such user");
  await startSession(id);
});
