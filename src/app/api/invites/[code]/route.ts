import { rateLimit, route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { inviteInfo, revokeInvite } from "@/lib/server/service";

/** Public: lets /join/CODE show who invited you before you sign up. */
export const GET = route(async (req, ctx: RouteContext<"/api/invites/[code]">) => {
  rateLimit(`peek:${req.headers.get("x-forwarded-for") ?? "local"}`, 60, 10 * 60_000);
  return inviteInfo((await ctx.params).code);
});

/** Revoke one of your own unused invites. */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/invites/[code]">) => {
  revokeInvite((await requireUser()).id, (await ctx.params).code);
});
