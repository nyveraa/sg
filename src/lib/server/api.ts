import type { NextRequest } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a route handler: ApiError → {error} with its status; anything else → 500. */
export function route<C = unknown>(fn: (req: NextRequest, ctx: C) => Promise<unknown>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function json(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    throw new ApiError(400, "Invalid request body");
  }
}

const g = globalThis as unknown as { __onyxHits?: Map<string, { n: number; reset: number }> };
const hits = (g.__onyxHits ??= new Map());

/** Fixed-window limiter (in-memory, single process): throws 429 past `max` hits per `windowMs`. */
export function rateLimit(key: string, max: number, windowMs: number) {
  // Escape hatch for automated tests against a dev server; ignored in production builds.
  if (process.env.NODE_ENV !== "production" && process.env.ONYX_NO_RATELIMIT === "1") return;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
  else if (++h.n > max) throw new ApiError(429, "Too many attempts — try again in a few minutes");
}

export const str =(v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
