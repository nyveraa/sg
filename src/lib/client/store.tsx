"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { previewOf } from "./format";
import { configureSound, sfx } from "./sound";
import { sanitizePrefs, type Prefs } from "../prefs";
import type { Bootstrap, Conversation, Effect, Me, Message, Post, ServerEvent, User } from "../types";

/* ───────────── state ───────────── */

type S = {
  me: Me | null;
  rawUsers: Record<string, User>;
  nicknames: Record<string, string>;
  convs: Record<string, Conversation>;
  msgs: Record<string, Message[]>;
  more: Record<string, boolean>; // older messages may exist
  loaded: Record<string, boolean>; // full history fetched (vs. just the preview message)
  typing: Record<string, Record<string, number>>;
  unreadFrom: Record<string, { from: number; count: number }>; // where the "new messages" divider goes
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
  | { t: "conv_removed"; convId: string }
  | { t: "boot"; data: Bootstrap }
  | { t: "conv"; conv: Conversation; users: User[] }
  | { t: "msgs"; convId: string; msgs: Message[]; older?: boolean }
  | { t: "msg"; m: Message; unread: boolean }
  | { t: "pending"; m: Message }
  | { t: "confirm"; tempId: number; m: Message }
  | { t: "mark"; tempId: number; patch: Partial<Message> }
  | { t: "drop"; convId: string; tempId: number }
  | { t: "upd"; m: Message }
  | { t: "read"; convId: string; userId: string; lastReadId: number }
  | { t: "typing"; convId: string; userId: string }
  | { t: "presence"; userId: string; online: boolean; lastSeen: number | null }
  | { t: "user"; user: User }
  | { t: "me"; me: Me }
  | { t: "nicknames"; nicknames: Record<string, string> }
  | { t: "open"; convId: string; from: number; count: number }
  | { t: "seen"; convId: string };

const empty: S = {
  me: null, rawUsers: {}, nicknames: {}, convs: {}, msgs: {}, more: {}, loaded: {}, typing: {}, unreadFrom: {},
  posts: [], stories: [], feedLoaded: false,
};
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
    case "conv_removed": {
      const { [a.convId]: _c, ...convs } = s.convs;
      const { [a.convId]: _m, ...msgs } = s.msgs;
      return { ...s, convs, msgs };
    }
    case "boot":
      return { ...empty, me: a.data.me, rawUsers: byId(a.data.users), convs: byId(a.data.conversations), nicknames: a.data.nicknames,
        posts: s.posts, stories: s.stories, feedLoaded: s.feedLoaded, unreadFrom: s.unreadFrom };
    case "conv": {
      const prev = s.convs[a.conv.id];
      return { ...s, convs: { ...s.convs, [a.conv.id]: a.conv }, rawUsers: { ...s.rawUsers, ...byId(a.users) },
        msgs: prev ? s.msgs : { ...s.msgs, [a.conv.id]: a.conv.last ? [a.conv.last] : [] } };
    }
    case "msgs": {
      const cur = s.msgs[a.convId] ?? [];
      const keep = cur.filter((m) => m.pending || m.failed); // unsent messages survive a refetch
      const merged = a.older ? [...a.msgs, ...cur] : [...a.msgs, ...keep];
      return { ...s, msgs: { ...s.msgs, [a.convId]: merged }, more: { ...s.more, [a.convId]: a.msgs.length >= 60 },
        loaded: { ...s.loaded, [a.convId]: true } };
    }
    case "msg": {
      const list = s.msgs[a.m.convId];
      const conv = s.convs[a.m.convId];
      if (list?.some((x) => x.id === a.m.id)) return s;
      const mine = a.m.senderId === s.me?.id;
      let next = list;
      if (list && mine && a.m.kind === "text") { // the server's copy of something we already showed optimistically
        const i = list.findIndex((x) => x.id < 0 && x.body === a.m.body);
        if (i >= 0) next = list.filter((_, k) => k !== i);
      }
      return {
        ...s,
        msgs: next ? { ...s.msgs, [a.m.convId]: [...next, a.m] } : s.msgs,
        convs: conv ? { ...s.convs, [a.m.convId]: { ...conv, last: a.m, updatedAt: a.m.createdAt,
          unread: conv.unread + (a.unread ? 1 : 0), archived: conv.archived && (mine || conv.muted),
          reads: a.m.senderId in conv.reads && conv.reads[a.m.senderId] !== 0 ? { ...conv.reads, [a.m.senderId]: a.m.id } : conv.reads } } : s.convs,
        typing: s.typing[a.m.convId]?.[a.m.senderId]
          ? { ...s.typing, [a.m.convId]: { ...s.typing[a.m.convId], [a.m.senderId]: 0 } } : s.typing,
      };
    }
    case "pending": {
      const list = s.msgs[a.m.convId] ?? [];
      return { ...s, msgs: { ...s.msgs, [a.m.convId]: [...list, a.m] } };
    }
    case "confirm": {
      const without = (s.msgs[a.m.convId] ?? []).filter((x) => x.id !== a.tempId);
      const has = without.some((x) => x.id === a.m.id);
      const conv = s.convs[a.m.convId];
      return {
        ...s,
        msgs: { ...s.msgs, [a.m.convId]: has ? without : [...without, a.m] },
        convs: conv ? { ...s.convs, [a.m.convId]: { ...conv, last: a.m, updatedAt: a.m.createdAt, archived: false } } : s.convs,
      };
    }
    case "mark": {
      const convId = Object.keys(s.msgs).find((k) => s.msgs[k].some((x) => x.id === a.tempId));
      if (!convId) return s;
      return { ...s, msgs: { ...s.msgs, [convId]: s.msgs[convId].map((x) => (x.id === a.tempId ? { ...x, ...a.patch } : x)) } };
    }
    case "drop":
      return { ...s, msgs: { ...s.msgs, [a.convId]: (s.msgs[a.convId] ?? []).filter((x) => x.id !== a.tempId) } };
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
    case "open":
      return { ...s, unreadFrom: { ...s.unreadFrom, [a.convId]: { from: a.from, count: a.count } } };
    case "typing":
      return { ...s, typing: { ...s.typing, [a.convId]: { ...s.typing[a.convId], [a.userId]: Date.now() } } };
    case "presence":
      return s.rawUsers[a.userId] ? { ...s, rawUsers: { ...s.rawUsers, [a.userId]: { ...s.rawUsers[a.userId], online: a.online, lastSeen: a.lastSeen } } } : s;
    case "user":
      return a.user.id === s.me?.id ? s : { ...s, rawUsers: { ...s.rawUsers, [a.user.id]: a.user } };
    case "me":
      return { ...s, me: a.me, rawUsers: { ...s.rawUsers, [a.me.id]: a.me } };
    case "nicknames":
      return { ...s, nicknames: a.nicknames };
  }
}

/* ───────────── context ───────────── */

export type Toast = { id: number; text: string; tone?: "error" | "ok" };
export type Celebration = { user: User; convId: string };
export type View = "chats" | "feed" | "friends";
export type ProfilePatch = { displayName?: string; bio?: string; status?: string; pronouns?: string; avatar?: string | null };

/** What components read. `users` already has your private nicknames applied. */
export type StateView = Omit<S, "rawUsers" | "me"> & { me: Me | null; users: Record<string, User> };

type StateCtxValue = {
  s: StateView;
  ready: boolean;
  active: string | null;
  view: View;
  celebration: Celebration | null;
  toasts: Toast[];
  friends: User[];
  totalUnread: number;
  profileUserId: string | null;
};

/** Stable for the life of the provider — components that only *do* things subscribe to this and never re-render for state. */
type Actions = {
  setActive: (id: string | null) => void;
  setView: (v: View) => void;
  send: (convId: string, input: { body?: string; image?: string; voice?: { audio: string; duration: number; peaks: number[] }; replyTo?: number }) => Promise<boolean>;
  retry: (tempId: number) => void;
  discard: (convId: string, tempId: number) => void;
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
  renameGroup: (convId: string, title: string) => Promise<void>;
  addMembers: (convId: string, userIds: string[]) => Promise<void>;
  leaveGroup: (convId: string) => Promise<void>;
  setConvPrefs: (convId: string, patch: { pinned?: boolean; muted?: boolean; archived?: boolean }) => void;
  saveProfile: (p: ProfilePatch) => Promise<void>;
  setPrefs: (p: Partial<Prefs>) => void;
  setNickname: (userId: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  fxRef: React.RefObject<((e: Effect) => void) | null>;
  closeCelebration: () => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  showProfile: (userId: string | null) => void;
};

export type Ctx = StateCtxValue & Actions;

const StateC = createContext<StateCtxValue | null>(null);
const ActionsC = createContext<Actions | null>(null);

export const useActions = () => {
  const v = useContext(ActionsC);
  if (!v) throw new Error("useActions outside provider");
  return v;
};
export const useOnyx = (): Ctx => {
  const st = useContext(StateC);
  const ac = useContext(ActionsC);
  if (!st || !ac) throw new Error("useOnyx outside provider");
  return useMemo(() => ({ ...st, ...ac }), [st, ac]);
};

let tempSeq = 0;

export function OnyxProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [s, dispatch] = useReducer(reducer, empty);
  const [booted, setBooted] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [active, setActiveState] = useState<string | null>(null);
  const [view, setView] = useState<View>("chats");
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [profileUserId, showProfile] = useState<string | null>(null);
  const fxRef = useRef<((e: Effect) => void) | null>(null);
  const sRef = useRef(s); sRef.current = s;
  const activeRef = useRef(active); activeRef.current = active;
  const seen = useRef(new Set<number>());
  const celebrated = useRef(new Set<string>());
  const lastTyping = useRef(0);
  const loaded = useRef(new Set<string>()); // conversations whose history has been fetched

  /** users with private nicknames layered on top */
  const users = useMemo(() => {
    const out: Record<string, User> = {};
    for (const [id, u] of Object.entries(s.rawUsers)) {
      const nick = s.nicknames[id];
      out[id] = nick && id !== s.me?.id ? { ...u, displayName: nick, realName: u.displayName } : u;
    }
    return out;
  }, [s.rawUsers, s.nicknames, s.me?.id]);
  const usersRef = useRef(users); usersRef.current = users;

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
    if (!sRef.current.convs[convId]) return;
    dispatch({ t: "seen", convId });
    void api("POST", `/api/conversations/${convId}/read`).catch(() => {});
  }, []);

  const setActive = useCallback((id: string | null) => {
    setActiveState(id);
    if (!id) return;
    setView("chats"); // opening a chat from anywhere (friends, celebration, palette) lands in Chats
    const c = sRef.current.convs[id], me = sRef.current.me;
    if (c && me) dispatch({ t: "open", convId: id, from: c.reads[me.id] ?? 0, count: c.unread });
    if (!loaded.current.has(id)) void fetchMessages(id).catch(() => {});
    markRead(id);
  }, [fetchMessages, markRead]);

  const notify = useCallback((m: Message) => {
    const st = sRef.current, prefs = st.me?.prefs;
    if (!prefs?.notifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (st.convs[m.convId]?.muted || (!document.hidden && activeRef.current === m.convId)) return;
    try {
      new Notification(usersRef.current[m.senderId]?.displayName ?? "Whisper", { body: previewOf(m, usersRef.current, st.me!.id).replace(/^You: /, ""), tag: m.convId, silent: true });
    } catch { /* notifications blocked */ }
  }, []);

  /** Side effects of a message appearing (once per id): sound, fullscreen effects, unread. */
  const ingest = useCallback((m: Message) => {
    const st = sRef.current;
    const mine = m.senderId === st.me?.id;
    const viewing = activeRef.current === m.convId && document.hasFocus();
    const fresh = !seen.current.has(m.id);
    seen.current.add(m.id);
    dispatch({ t: "msg", m, unread: !mine && m.kind !== "system" && !viewing });
    if (!fresh) return;
    if (!mine && m.kind !== "system") { if (!st.convs[m.convId]?.muted) sfx.receive(); notify(m); }
    if (m.kind === "effect" && Date.now() - m.createdAt < 8000 && (mine || activeRef.current === m.convId))
      fxRef.current?.((m.data as { effect: Effect }).effect);
    if (viewing && !mine) markRead(m.convId);
  }, [markRead, notify]);

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
        case "presence": dispatch({ t: "presence", userId: e.userId, online: e.online, lastSeen: e.lastSeen }); break;
        case "user": dispatch({ t: "user", user: e.user }); break;
        case "me": dispatch({ t: "me", me: e.me }); break;
        case "conversation_removed":
          if (activeRef.current === e.convId) setActiveState(null);
          dispatch({ t: "conv_removed", convId: e.convId });
          break;
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

  /* preferences → <html> attributes + sound engine */
  const prefs = s.me?.prefs;
  useEffect(() => {
    if (!prefs) return;
    const r = document.documentElement;
    r.dataset.accent = prefs.accent; r.dataset.wallpaper = prefs.wallpaper; r.dataset.bubbles = prefs.bubbles;
    r.dataset.text = prefs.textSize; r.dataset.fx = prefs.effects; r.dataset.compact = String(prefs.compact);
    configureSound(prefs);
  }, [prefs]);

  /* clear unread when the window regains focus on an open chat */
  useEffect(() => {
    const onFocus = () => { if (activeRef.current) markRead(activeRef.current); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [markRead]);

  const totalUnread = useMemo(() => Object.values(s.convs).reduce((n, c) => n + (c.muted ? 0 : c.unread), 0), [s.convs]);
  useEffect(() => { document.title = totalUnread ? `(${totalUnread}) Whisper` : "Whisper"; }, [totalUnread]);

  const friends = useMemo(() => {
    const ids = new Set<string>();
    for (const c of Object.values(s.convs)) if (c.kind === "dm") c.memberIds.forEach((id) => id !== s.me?.id && ids.add(id));
    return [...ids].map((id) => users[id]).filter(Boolean);
  }, [s.convs, users, s.me?.id]);

  /* ── actions (all stable) ── */
  const actions = useMemo<Actions>(() => {
    const findMsg = (id: number) => { for (const list of Object.values(sRef.current.msgs)) { const m = list.find((x) => x.id === id); if (m) return m; } return undefined; };
    const findPost = (id: number) => sRef.current.posts.find((p) => p.id === id) ?? sRef.current.stories.find((p) => p.id === id);

    /** Post to the server; on success swap the optimistic copy for the real one. */
    const deliver = async (convId: string, tempId: number | null, input: { body?: string; image?: string; voice?: { audio: string; duration: number; peaks: number[] }; replyTo?: number }) => {
      try {
        const { message } = await api<{ message: Message }>("POST", `/api/conversations/${convId}/messages`, input);
        if (tempId !== null) dispatch({ t: "confirm", tempId, m: message });
        ingest(message);
        sfx.send();
        return true;
      } catch (e) {
        if (tempId !== null) dispatch({ t: "mark", tempId, patch: { pending: false, failed: true } });
        fail(e);
        return false;
      }
    };

    return {
      setActive, setView, fxRef, showProfile, toast,
      send: async (convId, input) => {
        const me = sRef.current.me!;
        const text = input.body?.trim();
        // Plain text shows up instantly; commands, images and voice wait for the server (it generates or validates them).
        if (text && !input.image && !input.voice && !text.startsWith("/")) {
          const tempId = -(++tempSeq);
          const rep = input.replyTo ? sRef.current.msgs[convId]?.find((x) => x.id === input.replyTo) : undefined;
          dispatch({ t: "pending", m: {
            id: tempId, convId, senderId: me.id, kind: "text", body: text, data: null, createdAt: Date.now(), editedAt: null, deleted: false, reactions: [],
            replyTo: rep ? { id: rep.id, senderId: rep.senderId, kind: rep.kind, body: rep.kind === "image" ? "" : rep.body.slice(0, 120) } : null, pending: true,
          } });
          return deliver(convId, tempId, { ...input, body: text });
        }
        return deliver(convId, null, input);
      },
      retry: (tempId) => {
        const m = findMsg(tempId);
        if (!m) return;
        dispatch({ t: "mark", tempId, patch: { pending: true, failed: false } });
        void deliver(m.convId, tempId, { body: m.body, replyTo: m.replyTo?.id });
      },
      discard: (convId, tempId) => dispatch({ t: "drop", convId, tempId }),
      loadOlder: async (convId) => {
        const first = sRef.current.msgs[convId]?.find((m) => m.id > 0);
        if (first) await fetchMessages(convId, first.id).catch(fail);
      },
      react: (id, emoji) => {
        const m = findMsg(id), me = sRef.current.me;
        if (m && me) { // optimistic: flip the chip now, the server's event confirms it
          const mineNow = m.reactions.find((r) => r.emoji === emoji)?.userIds.includes(me.id);
          const reactions = mineNow
            ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, userIds: r.userIds.filter((u) => u !== me.id) } : r)).filter((r) => r.userIds.length)
            : m.reactions.some((r) => r.emoji === emoji)
              ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, me.id] } : r))
              : [...m.reactions, { emoji, userIds: [me.id] }];
          dispatch({ t: "upd", m: { ...m, reactions } });
        }
        void api("POST", `/api/messages/${id}/react`, { emoji }).catch((e) => { if (m) dispatch({ t: "upd", m }); fail(e); });
      },
      edit: async (id, body) => { await api("PATCH", `/api/messages/${id}`, { body }).catch(fail); },
      remove: (id) => { void api("DELETE", `/api/messages/${id}`).catch(fail); },
      act: (id, a) => { void api("POST", `/api/messages/${id}/act`, a).catch(fail); },
      createPost: async (input) => {
        try { await api("POST", "/api/posts", input); sfx.send(); return true; } catch (e) { fail(e); return false; }
      },
      likePost: (id) => {
        const p = findPost(id), me = sRef.current.me;
        if (p && me) dispatch({ t: "post_update", post: { ...p, likes: p.likes.includes(me.id) ? p.likes.filter((x) => x !== me.id) : [...p.likes, me.id] } });
        void api("POST", `/api/posts/${id}/like`).catch((e) => { if (p) dispatch({ t: "post_update", post: p }); fail(e); });
      },
      deletePost: (id) => { void api("DELETE", `/api/posts/${id}`).catch(fail); },
      unfriend: async (friendId) => { await api("DELETE", `/api/friends/${friendId}`); },
      typing: (convId) => {
        if (Date.now() - lastTyping.current < 1500) return;
        lastTyping.current = Date.now();
        void api("POST", `/api/conversations/${convId}/typing`).catch(() => {});
      },
      redeem: async (code) => {
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
      },
      mint: () => api<{ code: string; expiresAt: number }>("POST", "/api/invites"),
      createGroup: async (title, memberIds) => {
        const { conversation } = await api<{ conversation: Conversation }>("POST", "/api/conversations", { title, memberIds });
        setActive(conversation.id);
      },
      renameGroup: async (convId, title) => { await api("PATCH", `/api/conversations/${convId}`, { title }); },
      addMembers: async (convId, userIds) => { await api("POST", `/api/conversations/${convId}/members`, { userIds }); },
      leaveGroup: async (convId) => {
        await api("DELETE", `/api/conversations/${convId}/members/me`);
        if (activeRef.current === convId) setActiveState(null);
      },
      setConvPrefs: (convId, patch) => {
        const c = sRef.current.convs[convId];
        if (c) dispatch({ t: "conv", conv: { ...c, ...patch }, users: [] });
        void api("POST", `/api/conversations/${convId}/prefs`, patch).catch((e) => { if (c) dispatch({ t: "conv", conv: c, users: [] }); fail(e); });
      },
      saveProfile: async (p) => { const { me } = await api<{ me: Me }>("PATCH", "/api/me", p); dispatch({ t: "me", me }); },
      setPrefs: (p) => {
        const me = sRef.current.me;
        if (!me) return;
        const before = me.prefs;
        dispatch({ t: "me", me: { ...me, prefs: sanitizePrefs(p, before) } }); // applies instantly (accent, wallpaper…)
        void api<{ me: Me }>("PATCH", "/api/me", { prefs: p }).catch((e) => { dispatch({ t: "me", me: { ...me, prefs: before } }); fail(e); });
      },
      setNickname: async (userId, nickname) => {
        const { nicknames } = await api<{ nicknames: Record<string, string> }>("PUT", `/api/nicknames/${userId}`, { nickname });
        dispatch({ t: "nicknames", nicknames });
      },
      logout: async () => { await api("POST", "/api/auth/logout"); router.replace("/"); },
      closeCelebration: () => setCelebration(null),
    };
  }, [setActive, ingest, fail, toast, fetchMessages, celebrate, router]);

  const stateView = useMemo<StateView>(() => {
    const { rawUsers: _r, ...rest } = s;
    void _r;
    return { ...rest, users };
  }, [s, users]);

  const stateValue = useMemo<StateCtxValue>(
    () => ({ s: stateView, ready: booted && splashDone, active, view, celebration, toasts, friends, totalUnread, profileUserId }),
    [stateView, booted, splashDone, active, view, celebration, toasts, friends, totalUnread, profileUserId]);

  return (
    <ActionsC.Provider value={actions}>
      <StateC.Provider value={stateValue}>{children}</StateC.Provider>
    </ActionsC.Provider>
  );
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
