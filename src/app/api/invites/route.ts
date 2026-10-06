import { rateLimit, route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { listInvites, mintInvite } from "@/lib/server/service";

export const GET = route(async () => ({ invites: listInvites((await requireUser()).id) }));

/** "Ask for an invite link": mints a fresh single-use code, valid for 7 days. */
export const POST = route(async () => {
  const me = await requireUser();
  rateLimit(`mint:${me.id}`, 30, 60 * 60_000);
  return mintInvite(me.id);
});
