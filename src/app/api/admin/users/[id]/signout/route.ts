import { route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/admin";
import { adminListUsers, adminSignOutEverywhere } from "@/lib/server/service";

export const POST = route<RouteContext<"/api/admin/users/[id]/signout">>(async (_req, ctx) => {
  await requireAdmin();
  adminSignOutEverywhere((await ctx.params).id);
  return { users: adminListUsers() };
});
