import type { ServerEvent } from "../types";

type Listener = (e: ServerEvent) => void;
const g = globalThis as unknown as { __onyxBus?: Map<string, Set<Listener>> };
const listeners = (g.__onyxBus ??= new Map());

/** Registers a live stream for a user. `first` is true when they were offline before. */
export function subscribe(userId: string, fn: Listener) {
  let set = listeners.get(userId);
  if (!set) listeners.set(userId, (set = new Set()));
  const first = set.size === 0;
  set.add(fn);
  return {
    first,
    /** Returns true when this was the user's last live stream (they went offline). */
    unsubscribe() {
      set.delete(fn);
      if (set.size === 0 && listeners.get(userId) === set) listeners.delete(userId);
      return set.size === 0;
    },
  };
}

export function isOnline(userId: string) {
  return (listeners.get(userId)?.size ?? 0) > 0;
}

export function emitTo(userIds: Iterable<string>, event: ServerEvent) {
  for (const id of new Set(userIds)) {
    for (const fn of listeners.get(id) ?? []) {
      try {
        fn(event);
      } catch {
        /* dead stream — its abort handler cleans up */
      }
    }
  }
}
