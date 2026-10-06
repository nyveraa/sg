import { requireUser } from "@/lib/server/auth";
import { route } from "@/lib/server/api";
import { subscribe } from "@/lib/server/bus";
import { broadcastPresence } from "@/lib/server/service";
import type { ServerEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Server-Sent Events: one long-lived stream per tab. Everything realtime flows through here. */
export const GET = route(async (req) => {
  const me = await requireUser();
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try { controller.enqueue(enc.encode(chunk)); } catch { cleanup(); }
      };
      const sub = subscribe(me.id, (e: ServerEvent) => send(`data: ${JSON.stringify(e)}\n\n`));
      if (sub.first) broadcastPresence(me.id, true);
      const ping = setInterval(() => send(": ping\n\n"), 15_000);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        if (sub.unsubscribe()) broadcastPresence(me.id, false);
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", cleanup);
      send("retry: 2000\n: connected\n\n");
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
});
