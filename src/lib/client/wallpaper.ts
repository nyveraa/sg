"use client";

import { useCallback, useEffect, useState } from "react";
import type { Prefs } from "../prefs";

type Wp = Prefs["wallpaper"];
const key = (convId: string) => `nocturne:wp:${convId}`;

/** A per-chat wallpaper override (null = follow your global wallpaper). Kept on this device. */
export function useChatWallpaper(convId: string) {
  const read = (): Wp | null => { try { return (localStorage.getItem(key(convId)) as Wp | null) || null; } catch { return null; } };
  const [wp, setWp] = useState<Wp | null>(null);
  useEffect(() => {
    setWp(read());
    const on = () => setWp(read());
    window.addEventListener("nocturne:wp", on);
    return () => window.removeEventListener("nocturne:wp", on);
  }, [convId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((next: Wp | null) => {
    try { next ? localStorage.setItem(key(convId), next) : localStorage.removeItem(key(convId)); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event("nocturne:wp"));
  }, [convId]);
  return [wp, set] as const;
}
