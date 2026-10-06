import { json, rateLimit, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { redeemInvite } from "@/lib/server/service";

/** The (+) button: enter someone's code and you're instantly friends with a chat open. */
export const POST = route(async (req) => {
  const me = await requireUser();
  rateLimit(`redeem:${me.id}`, 15, 10 * 60_000); // codes are 32^8 but don't allow guessing
  const b = await json(req);
  return { conversation: redeemInvite(me.id, str(b.code, 32)) };
});
