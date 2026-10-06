import { json, rateLimit, route, str } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { listMessages, sendMessage } from "@/lib/server/service";

export const GET = route(async (req, ctx: RouteContext<"/api/conversations/[id]/messages">) => {
  const me = await requireUser();
  const before = Number(req.nextUrl.searchParams.get("before")) || undefined;
  return { messages: listMessages(me.id, (await ctx.params).id, before) };
});

export const POST = route(async (req, ctx: RouteContext<"/api/conversations/[id]/messages">) => {
  const me = await requireUser();
  rateLimit(`send:${me.id}`, 60, 60_000);
  const b = await json(req);
  const v = b.voice as { audio?: unknown; duration?: unknown; peaks?: unknown } | undefined;
  const message = sendMessage(me.id, (await ctx.params).id, {
    body: str(b.body, 4000),
    image: typeof b.image === "string" ? b.image : undefined,
    voice: v && typeof v.audio === "string" && typeof v.duration === "number" && Array.isArray(v.peaks)
      ? { audio: v.audio, duration: v.duration, peaks: v.peaks as number[] } : undefined,
    replyTo: typeof b.replyTo === "number" ? b.replyTo : undefined,
  });
  return { message };
});
