import { ApiError, json, rateLimit, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { createPost } from "@/lib/server/service";

export const POST = route(async (req) => {
  const me = await requireUser();
  rateLimit(`post:${me.id}`, 40, 60 * 60_000);
  const b = await json(req);
  if (b.kind !== "post" && b.kind !== "story") throw new ApiError(400, "kind must be post or story");
  return { post: createPost(me.id, {
    kind: b.kind,
    body: str(b.body, 1500),
    image: typeof b.image === "string" ? b.image : undefined,
    tone: typeof b.tone === "number" ? b.tone : undefined,
  }) };
});
