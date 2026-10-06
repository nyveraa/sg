import { json, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { createGroup } from "@/lib/server/service";

export const POST = route(async (req) => {
  const me = await requireUser();
  const b = await json(req);
  const members = Array.isArray(b.memberIds) ? b.memberIds.filter((x): x is string => typeof x === "string") : [];
  return { conversation: createGroup(me.id, str(b.title, 40), members) };
});
