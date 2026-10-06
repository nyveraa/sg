"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { sfx } from "./sound";
import type { Bootstrap, Conversation, Effect, Message, Post, ServerEvent, User } from "../types";

/* ───────────── state ───────────── */

type S = {
  me: User | null;
  users: Record<string, User>;
  convs: Record<string, Conversation>;
  msgs: Record<string, Message[]>;
  more: Record<string, boolean>; // older messages may exist
  loaded: Record<string, boolean>; // full history fetched (vs. just the preview message)
  typing: Record<string, Record<string, number>>;
  posts: Post[]; // newest first
  stories: Post[]; // oldest first, last 24h
  feedLoaded: boolean;
};

type A =
  | { t: "feed"; posts: Post[]; stories: Post[] }
  | { t: "post"; post: Post }
  | { t: "post_update"; post: Post }
  | { t: "post_removed"; id: number }
  | { t: "friend_removed"; userId: string; convId: string }
  | { t: "boot"; data: Bootstrap }
  | { t: "conv"; conv: Conversation; users: User[] }
  | { t: "msgs"; convId: string; msgs: Message[]; older?: boolean }
  | { t: "msg"; m: Message; unread: boolean }
  | { t: "upd"; m: Message }
  | { t: "read"; convId: string; userId: string; lastReadId: number }
  | { t: "typing"; convId: string; userId: string }
  | { t: "presence"; userId: string; online: boolean }
  | { t: "user"; user: User }
  | { t: "seen"; convId: string };

const empty: S = { me: null, users: {}, convs: {}, msgs: {}, more: {}, loaded: {}, typing: {}, posts: [], stories: [], feedLoaded: false };
const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x]));
const swap = (xs: Post[], p: Post) => xs.map((x) => (x.id === p.id ? p : x));

function reducer(s: S, a: A): S {
  switch (a.t) {
    case "feed":
      return { ...s, posts: a.posts, stories: a.stories, feedLoaded: true };
    case "post":
      return a.post.kind === "story"
        ? { ...s, stories: s.stories.some((x) => x.id === a.post.id) ? s.stories : [...s.stories, a.post] }
        : { ...s, posts: s.posts.some((x) => x.id === a.post.id) ? s.posts : [a.post, ...s.posts] };
    case "post_update":
      return { ...s, posts: swap(s.posts, a.post), stories: swap(s.stories, a.post) };
    case "post_removed":
      return { ...s, posts: s.posts.filter((x) => x.id !== a.id), stories: s.stories.filter((x) => x.id !== a.id) };
    case "friend_removed": {
      const { [a.convId]: _c, ...convs } = s.convs;
      const { [a.convId]: _m, ...msgs } = s.msgs;
      const keep = (p: Post) => p.userId !== a.userId || p.userId === s.me?.id;
      return { ...s, convs, msgs, posts: s.posts.filter(keep), stories: s.stories.filter(keep) };
    }
    case "boot":
      return { ...empty, me: a.data.me, users: byId(a.data.users), convs: byId(a.data.conversations), posts: s.posts, stories: s.stories, feedLoaded: s.feedLoaded };
    case "conv": {
      const prev = s.convs[a.conv.id];
      return { ...s, convs: { ...s.convs, [a.conv.id]: a.conv }, users: { ...s.users, ...byId(a.users) },
        msgs: prev ? s.msgs : { ...s.msgs, [a.conv.id]: a.conv.last ? [a.conv.last] : [] } };
    }
    case "msgs": {
      const cur = s.msgs[a.convId] ?? [];
      const merged = a.older ? [...a.msgs, ...cur] : a.msgs;
      return { ...s, msgs: { ...s.msgs, [a.convId]: merged }, more: { ...s.more, [a.convId]: a.msgs.length >= 60 },
        loaded: { ...s.loaded, [a.convId]: true } };
    }
    case "msg": {
      const list = s.msgs[a.m.convId];
      const conv = s.convs[a.m.convId];
      if (list?.some((x) => x.id === a.m.id)) return s;
      return {
        ...s,
        msgs: list ? { ...s.msgs, [a.m.convId]: [...list, a.m] } : s.msgs,
        convs: conv ? { ...s.convs, [a.m.convId]: { ...conv, last: a.m, updatedAt: a.m.createdAt,
          unread: conv.unread + (a.unread ? 1 : 0),
          reads: a.m.senderId in conv.reads ? { ...conv.reads, [a.m.senderId]: a.m.id } : conv.reads } } : s.convs,
        typing: s.typing[a.m.convId]?.[a.m.senderId]
          ? { ...s.typing, [a.m.convId]: { ...s.typing[a.m.convId], [a.m.senderId]: 0 } } : s.typing,
      };
    }
    case "upd": {
      const list = s.msgs[a.m.convId];
      const conv = s.convs[a.m.convId];
      return {
        ...s,
        msgs: list ? { ...s.msgs, [a.m.convId]: list.map((x) => (x.id === a.m.id ? a.m : x)) } : s.msgs,
        convs: conv?.last?.id === a.m.id ? { ...s.convs, [a.m.convId]: { ...conv, last: a.m } } : s.convs,
      };
    }
    case "read": {
      const c = s.convs[a.convId];
      if (!c) return s;
      const mine = a.userId === s.me?.id;
      return { ...s, convs: { ...s.convs, [a.convId]: { ...c, unread: mine ? 0 : c.unread,
        reads: { ...c.reads, [a.userId]: a.lastReadId } } } };
    }
    case "seen": {
      const c = s.convs[a.convId];
      return c && c.unread ? { ...s, convs: { ...s.convs, [a.convId]: { ...c, unread: 0 } } } : s;
    }
    case "typing":
      return { ...s, typing: { ...s.typing, [a.convId]: { ...s.typing[a.convId], [a.userId]: Date.now() } } };
    case "presence":
      return s.users[a.userId] ? { ...s, users: { ...s.users, [a.userId]: { ...s.users[a.userId], online: a.online } } } : s;
    case "user":
      return { ...s, users: { ...s.users, [a.user.id]: a.user }, me: s.me?.id === a.user.id ? a.user : s.me };
  }
}

/* ───────────── context ───────────── */

export type View = "chats" | "feed" | "friends";
export type Toast = { id: number; text: string; tone?: "error" | "ok" };
export type Celebration = { user: User; convId: string };

type Ctx = {
  s: S;
  ready: boolean;
  active: string | null;
  setActive: (id: string | null) => void;
  view: View;
  setView: (v: View) => void;
  send: (convId: string, input: { body?: string; image?: string; voice?: { audio: string; duration: number; peaks: number[] }; replyTo?: number }) => Promise<boolean>;
  loadOlder: (convId: string) => Promise<void>;
  react: (id: number, emoji: string) => void;
  edit: (id: number, body: string) => Promise<void>;
  remove: (id: number) => void;
  act: (id: number, a: { option?: number; cell?: number; col?: number; pick?: string }) => void;
  createPost: (input: { kind: "post" | "story"; body: string; image?: string; tone?: number }) => Promise<boolean>;
  likePost: (id: number) => void;
  deletePost: (id: number) => void;
  unfriend: (friendId: string) => Promise<void>;
  typing: (convId: string) => void;
  redeem: (code: string) => Promise<void>;
  mint: () => Promise<{ code: string; expiresAt: number }>;
  createGroup: (title: string, memberIds: string[]) => Promise<void>;
  saveProfile: (p: { displayName?: string; bio?: string }) => Promise<void>;
  logout: () => Promise<void>;
  fxRef: React.RefObject<((e: Effect) => void) | null>;
  celebration: Celebration | null;
  closeCelebration: () => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast["tone"]) => void;
  friends: User[];
  totalUnread: number;
};

const C = createContext<Ctx | null>(null);
export const useOnyx = () => {
  const v = useContext(C);
  if (!v) throw new Error("useOnyx outside provider");
  return v;
};

export function OnyxProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [s, dispatch] = useReducer(reducer, empty);
  const [booted, setBooted] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [active, setActiveState] = useState<string | null>(null);
  const [view, setView] = useState<View>("chats");
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fxRef = useRef<((e: Effect) => void) | null>(null);
  const sRef = useRef(s); sRef.current = s;
  const activeRef = useRef(active); activeRef.current = active;
  const seen = useRef(new Set<number>());
  const celebrated = useRef(new Set<string>());
  const lastTyping = useRef(0);
  const loaded = useRef(new Set<string>()); // conversations whose history has been fetched

  const toast = useCallback((text: string, tone?: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const fail = useCallback((e: unknown) => toast(e instanceof Error ? e.message : "Something went wrong", "error"), [toast]);

  const fetchMessages = useCallback(async (convId: string, before?: number) => {
    const { messages } = await api<{ messages: Message[] }>("GET", `/api/conversations/${convId}/messages${before ? `?before=${before}` : ""}`);
    loaded.current.add(convId);
    dispatch({ t: "msgs", convId, msgs: messages, older: !!before });
  }, []);

  const markRead = useCallback((convId: string) => {
    const c = sRef.current.convs[convId];
    if (!c) return;
    dispatch({ t: "seen", convId });
    void api("POST", `/api/conversations/${convId}/read`).catch(() => {});
  }, []);

  const setActive = useCallback((id: string | null) => {
    setActiveState(id);
    if (!id) return;
    setView("chats"); // opening a chat from anywhere (friends, celebration) lands in Chats
    if (!loaded.current.has(id)) void fetchMessages(id).catch(() => {});
    markRead(id);
  }, [fetchMessages, markRead]);

  /** Side effects of a message appearing (once per id): sound, fullscreen effects, unread. */
  const ingest = useCallback((m: Message) => {
    const st = sRef.current;
    const mine = m.senderId === st.me?.id;
    const viewing = activeRef.current === m.convId && document.hasFocus();
    const fresh = !seen.current.has(m.id);
    seen.current.add(m.id);
    dispatch({ t: "msg", m, unread: !mine && m.kind !== "system" && !viewing });
    if (!fresh) return;
    if (!mine && m.kind !== "system") sfx.receive();
    if (m.kind === "effect" && Date.now() - m.createdAt < 8000 && (mine || activeRef.current === m.convId))
      fxRef.current?.((m.data as { effect: Effect }).effect);
    if (viewing && !mine) markRead(m.convId);
  }, [markRead]);

  const celebrate = useCallback((user: User, convId: string) => {
    if (celebrated.current.has(convId)) return;
    celebrated.current.add(convId);
    setCelebration({ user, convId });
    sfx.connect();
    setTimeout(() => fxRef.current?.("confetti"), 450);
  }, []);

  /* boot */
  useEffect(() => {
    let dead = false;
    api<Bootstrap>("GET", "/api/bootstrap")
      .then((data) => {
        if (dead) return;
        dispatch({ t: "boot", data });
        setBooted(true);
        void api<{ posts: Post[]; stories: Post[] }>("GET", "/api/feed").then((f) => dispatch({ t: "feed", ...f })).catch(() => {});
        // Arrived via an invite link: open that chat and play the celebration once the splash clears.
        const welcome = new URLSearchParams(location.search).get("welcome");
        if (welcome) {
          history.replaceState(null, "", "/app");
          const conv = data.conversations.find((c) => c.id === welcome);
          const friend = data.users.find((u) => u.id === conv?.memberIds.find((id) => id !== data.me.id));
          if (conv && friend) setTimeout(() => celebrate(friend, conv.id), 1700);
        }
      })
      .catch(() => router.replace("/"));
    const t = setTimeout(() => setSplashDone(true), 1500);
    return () => { dead = true; clearTimeout(t); };
  }, [router, celebrate]);

  /* realtime */
  useEffect(() => {
    if (!booted) return;
    let opened = false;
    const es = new EventSource("/api/stream");
    es.onopen = () => {
      if (opened) { // reconnect: resync what we missed
        void api<Bootstrap>("GET", "/api/bootstrap").then((data) => {
          loaded.current.clear();
          dispatch({ t: "boot", data });
          if (activeRef.current) void fetchMessages(activeRef.current);
        }).catch(() => {});
        void api<{ posts: Post[]; stories: Post[] }>("GET", "/api/feed").then((f) => dispatch({ t: "feed", ...f })).catch(() => {});
      }
      opened = true;
    };
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data) as ServerEvent;
      switch (e.type) {
        case "message": ingest(e.message); break;
        case "message_update": dispatch({ t: "upd", m: e.message }); break;
        case "read": dispatch({ t: "read", convId: e.convId, userId: e.userId, lastReadId: e.lastReadId }); break;
        case "typing": dispatch({ t: "typing", convId: e.convId, userId: e.userId }); break;
        case "presence": dispatch({ t: "presence", userId: e.userId, online: e.online }); break;
        case "user": dispatch({ t: "user", user: e.user }); break;
        case "conversation": {
          const isNew = !sRef.current.convs[e.conversation.id];
          dispatch({ t: "conv", conv: e.conversation, users: e.users });
          if (e.celebrate) {
            const u = e.users.find((x) => x.id === e.celebrate);
            if (u) celebrate(u, e.conversation.id);
          } else if (isNew) sfx.receive();
          break;
        }
        case "post":
          dispatch({ t: "post", post: e.post });
          if (e.post.userId !== sRef.current.me?.id) sfx.pop();
          break;
        case "post_update": dispatch({ t: "post_update", post: e.post }); break;
        case "post_removed": dispatch({ t: "post_removed", id: e.id }); break;
        case "friend_removed":
          if (activeRef.current === e.convId) setActiveState(null);
          dispatch({ t: "friend_removed", userId: e.userId, convId: e.convId });
          break;
      }
    };
    return () => es.close();
  }, [booted, ingest, celebrate, fetchMessages]);

  /* clear unread when the window regains focus on an open chat */
  useEffect(() => {
    const onFocus = () => { if (activeRef.current) markRead(activeRef.current); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [markRead]);

  const totalUnread = useMemo(() => Object.values(s.convs).reduce((n, c) => n + c.unread, 0), [s.convs]);
  useEffect(() => { document.title = totalUnread ? `(${totalUnread}) onyx.` : "onyx."; }, [totalUnread]);

  const send: Ctx["send"] = useCallback(async (convId, input) => {
    try {
      const { message } = await api<{ message: Message }>("POST", `/api/conversations/${convId}/messages`, input);
      ingest(message);
      sfx.send();
      return true;
    } catch (e) { fail(e); return false; }
  }, [ingest, fail]);

  const value: Ctx = {
    s, ready: booted && splashDone, active, setActive, send, view, setView,
    createPost: useCallback(async (input) => {
      try { await api("POST", "/api/posts", input); sfx.send(); return true; } catch (e) { fail(e); return false; }
    }, [fail]),
    likePost: useCallback((id) => { void api("POST", `/api/posts/${id}/like`).catch(fail); }, [fail]),
    deletePost: useCallback((id) => { void api("DELETE", `/api/posts/${id}`).catch(fail); }, [fail]),
    unfriend: useCallback(async (friendId) => { await api("DELETE", `/api/friends/${friendId}`); }, []),
    loadOlder: useCallback(async (convId) => {
      const first = sRef.current.msgs[convId]?.[0];
      if (first) await fetchMessages(convId, first.id).catch(fail);
    }, [fetchMessages, fail]),
    react: useCallback((id, emoji) => { void api("POST", `/api/messages/${id}/react`, { emoji }).catch(fail); }, [fail]),
    edit: useCallback(async (id, body) => { await api("PATCH", `/api/messages/${id}`, { body }).catch(fail); }, [fail]),
    remove: useCallback((id) => { void api("DELETE", `/api/messages/${id}`).catch(fail); }, [fail]),
    act: useCallback((id, a) => { void api("POST", `/api/messages/${id}/act`, a).catch(fail); }, [fail]),
    typing: useCallback((convId) => {
      if (Date.now() - lastTyping.current < 2500) return;
      lastTyping.current = Date.now();
      void api("POST", `/api/conversations/${convId}/typing`).catch(() => {});
    }, []),
    redeem: useCallback(async (code) => {
      const { conversation } = await api<{ conversation: Conversation }>("POST", "/api/invites/redeem", { code });
      const friendId = conversation.memberIds.find((id) => id !== sRef.current.me?.id);
      // The live event normally lands first; this makes it work even if the stream is mid-reconnect.
      if (!sRef.current.convs[conversation.id]) {
        const boot = await api<Bootstrap>("GET", "/api/bootstrap");
        dispatch({ t: "boot", data: boot });
        const friend = boot.users.find((u) => u.id === friendId);
        if (friend) celebrate(friend, conversation.id);
      }
      setActive(conversation.id);
    }, [celebrate, setActive]),
    mint: useCallback(() => api<{ code: string; expiresAt: number }>("POST", "/api/invites"), []),
    createGroup: useCallback(async (title, memberIds) => {
      const { conversation } = await api<{ conversation: Conversation }>("POST", "/api/conversations", { title, memberIds });
      setActive(conversation.id);
    }, [setActive]),
    saveProfile: useCallback(async (p) => { await api("PATCH", "/api/me", p); }, []),
    logout: useCallback(async () => { await api("POST", "/api/auth/logout"); router.replace("/"); }, [router]),
    fxRef, celebration, closeCelebration: useCallback(() => setCelebration(null), []), toasts, toast,
    friends: useMemo(() => {
      const ids = new Set<string>();
      for (const c of Object.values(s.convs)) if (c.kind === "dm") c.memberIds.forEach((id) => id !== s.me?.id && ids.add(id));
      return [...ids].map((id) => s.users[id]).filter(Boolean);
    }, [s.convs, s.users, s.me]),
    totalUnread,
  };

  return <C.Provider value={value}>{children}</C.Provider>;
}

/** Display helpers shared by the UI. */
export function convName(c: Conversation, users: Record<string, User>, meId: string) {
  if (c.kind === "group") return c.title ?? "Group";
  const other = users[c.memberIds.find((id) => id !== meId) ?? ""];
  return other?.displayName ?? "Unknown";
}
export function convPeer(c: Conversation, users: Record<string, User>, meId: string) {
  return c.kind === "dm" ? users[c.memberIds.find((id) => id !== meId) ?? ""] : undefined;
}
