import { json, route, str } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/admin";
import { adminListUsers, createUser } from "@/lib/server/service";

export const GET = route(async () => {
  await requireAdmin();
  return { users: adminListUsers() };
});

export const POST = route(async (req) => {
  await requireAdmin();
  const b = await json(req);
  createUser(str(b.username, 20), str(b.displayName, 40), typeof b.password === "string" ? b.password.slice(0, 200) : "");
  return { users: adminListUsers() };
});
