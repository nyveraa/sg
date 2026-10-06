import { json, route, str } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/admin";
import { adminListUsers, adminUpdateUser, adminUserDetail, removeUser } from "@/lib/server/service";

export const GET = route<RouteContext<"/api/admin/users/[id]">>(async (_req, ctx) => {
  await requireAdmin();
  return adminUserDetail((await ctx.params).id);
});

export const PATCH = route<RouteContext<"/api/admin/users/[id]">>(async (req, ctx) => {
  await requireAdmin();
  const b = await json(req);
  adminUpdateUser((await ctx.params).id, {
    username: typeof b.username === "string" ? str(b.username, 20) : undefined,
    displayName: typeof b.displayName === "string" ? str(b.displayName, 40) : undefined,
    bio: typeof b.bio === "string" ? str(b.bio, 160) : undefined,
    password: typeof b.password === "string" && b.password ? b.password.slice(0, 200) : undefined,
  });
  return { users: adminListUsers() };
});

export const DELETE = route<RouteContext<"/api/admin/users/[id]">>(async (_req, ctx) => {
  await requireAdmin();
  removeUser((await ctx.params).id);
  return { users: adminListUsers() };
});
