"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ChevronLeft, Search, Volume2, VolumeX, X } from "lucide-react";
import { convName, convPeer, useOnyx } from "@/lib/client/store";
import { isMuted, setMuted } from "@/lib/client/sound";
import type { Conversation, Message } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { MessageView } from "./MessageView";
import { HeroScene } from "./Scene";

const day = (ts: number) => {
  const d = new Date(ts), t = new Date();
  if (d.toDateString() === t.toDateString()) return "Today";
  if (new Date(t.getTime() - 864e5).toDateString() === d.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
};

export function ChatPane({ onImage, className = "" }: { onImage: (src: string) => void; className?: string }) {
  const { s, active } = useOnyx();
  const conv = active ? s.convs[active] : null;
  return (
    <section className={`relative min-w-0 flex-1 flex-col overflow-hidden bg-black/40 ${className}`}>
      {conv ? <Chat key={conv.id} conv={conv} onImage={onImage} /> : <NoChat />}
    </section>
  );
}

function NoChat() {
  return (
    <div className="relative h-full">
      <div className="absolute inset-0"><HeroScene compact /></div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#000_95%)]" />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="absolute inset-x-0 bottom-14 text-center">
        <div className="label mb-3">No conversation open</div>
        <p className="display text-[34px]">Pick up <em>where you left off.</em></p>
      </motion.div>
    </div>
  );
}

function Chat({ conv, onImage }: { conv: Conversation; onImage: (src: string) => void }) {
  const { s, setActive, loadOlder } = useOnyx();
  const me = s.me!;
  const [reply, setReply] = useState<Message | null>(null);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [muted, setMutedState] = useState(isMuted());
  const [newBelow, setNewBelow] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const initialised = useRef(false);
  const prevLast = useRef(0);

  const all = s.msgs[conv.id] ?? [];
  const loaded = !!s.loaded[conv.id];
  const needle = searching ? q.trim().toLowerCase() : "";
  const msgs = needle ? all.filter((m) => m.kind === "text" && !m.deleted && m.body.toLowerCase().includes(needle)) : all;
  const peer = convPeer(conv, s.users, me.id);
  const name = convName(conv, s.users, me.id);

  /* typing indicator (entries expire after 3.5s; tick once a second while any are live) */
  const typers = Object.entries(s.typing[conv.id] ?? {}).filter(([id, t]) => id !== me.id && Date.now() - t < 3500).map(([id]) => s.users[id]?.displayName).filter(Boolean);
  useEffect(() => {
    if (!typers.length) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [typers.length, now]);

  /* scrolling: stick to bottom unless the reader scrolled up */
  const toBottom = (smooth: boolean) => box.current?.scrollTo({ top: box.current.scrollHeight, behavior: smooth ? "smooth" : "instant" });
  useLayoutEffect(() => {
    if (!loaded) return;
    const last = all[all.length - 1];
    if (!initialised.current) { initialised.current = true; toBottom(false); }
    else if (last && last.id !== prevLast.current) { // appended (a prepend keeps the same last id)
      if (stick.current || last.senderId === me.id) toBottom(true);
      else setNewBelow((n) => n + 1);
    }
    prevLast.current = last?.id ?? 0;
  }, [all.length, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function older() {
    const el = box.current!, before = el.scrollHeight;
    await loadOlder(conv.id);
    requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - before; });
  }

  /* "Seen" under my most recent message */
  const lastMine = [...all].reverse().find((m) => m.senderId === me.id && !m.deleted && m.kind !== "system" && m.kind !== "effect");
  const seenFor = (m: Message) => {
    if (m.id !== lastMine?.id) return undefined;
    const readers = conv.memberIds.filter((id) => id !== me.id && (conv.reads[id] ?? 0) >= m.id);
    if (!readers.length) return "Sent";
    return conv.kind === "dm" ? "Seen" : `Seen by ${readers.length}`;
  };

  const onlineCount = conv.memberIds.filter((id) => id !== me.id && s.users[id]?.online).length;
  const status = typers.length
    ? <span className="flex items-center gap-2 text-white"><span className="flex gap-0.5"><i className="dot" /><i className="dot" /><i className="dot" /></span>{conv.kind === "group" ? `${typers.join(", ")} typing` : "Typing"}</span>
    : conv.kind === "dm"
      ? <span className={peer?.online ? "text-white" : ""}>{peer?.online ? "Online now" : "Offline"}{peer?.bio ? <span className="text-dim normal-case tracking-normal"> — {peer.bio}</span> : null}</span>
      : <span>{conv.memberIds.length} members · {onlineCount} online</span>;

  const rows = useMemo(() => msgs.map((m, i) => {
    const prev = msgs[i - 1], next = msgs[i + 1];
    const plain = (x: Message) => !["system", "effect"].includes(x.kind);
    const sameRun = (a?: Message, b?: Message) => !!a && !!b && a.senderId === b.senderId && plain(a) && plain(b) && Math.abs(b.createdAt - a.createdAt) < 5 * 60_000 && day(a.createdAt) === day(b.createdAt);
    return { m, sep: !prev || day(prev.createdAt) !== day(m.createdAt) ? day(m.createdAt) : null,
      showName: conv.kind === "group" && !sameRun(prev, m), showAvatar: !sameRun(m, next), tail: !sameRun(m, next) };
  }), [msgs, conv.kind]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[76px] shrink-0 items-center gap-4 border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent px-4 md:px-8">
        <button onClick={() => setActive(null)} aria-label="Back to chats" className="grid h-9 w-9 place-items-center text-mute hover:text-white md:hidden"><ChevronLeft size={22} /></button>
        <Avatar user={peer} group={conv.kind === "group"} size={44} online={conv.kind === "dm" ? peer?.online : undefined} />
        <div className="min-w-0 flex-1">
          <h2 className="display truncate text-[27px] leading-none">{name}</h2>
          <div className="label mt-2 truncate" aria-live="polite">{status}</div>
        </div>
        <HeaderBtn label={muted ? "Unmute sounds" : "Mute sounds"} onClick={() => { setMuted(!muted); setMutedState(!muted); }}>{muted ? <VolumeX size={17} strokeWidth={1.6} /> : <Volume2 size={17} strokeWidth={1.6} />}</HeaderBtn>
        <HeaderBtn label="Search in chat" pressed={searching} onClick={() => { setSearching((v) => !v); setQ(""); }}><Search size={17} strokeWidth={1.6} /></HeaderBtn>
      </header>

      <AnimatePresence>
        {searching && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-b border-white/10">
            <div className="flex items-center gap-3 px-8 py-3.5">
              <Search size={15} className="text-dim" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this conversation" aria-label="Search messages" className="flex-1 bg-transparent text-sm outline-none placeholder:text-dim" />
              {needle && <span className="label">{msgs.length} found</span>}
              <button onClick={() => { setSearching(false); setQ(""); }} aria-label="Close search" className="text-mute hover:text-white"><X size={16} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={box} className="relative flex-1 overflow-y-auto"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; if (stick.current) setNewBelow(0); }}>
        <div className="mx-auto w-full max-w-[880px] px-4 py-8 md:px-8">
          {!loaded ? <Skeletons /> : (
            <>
              {s.more[conv.id] && !needle && <button onClick={older} className="btn btn-ghost btn-sm mx-auto mb-8 flex">Load earlier</button>}
              {rows.length === 0 && <p className="display py-24 text-center text-[30px] text-white/80">{needle ? <>Nothing matches “{q}”.</> : <>Say <em>something.</em></>}</p>}
              {rows.map(({ m, sep, showName, showAvatar, tail }) => (
                <div key={m.id}>
                  {sep && <div className="label my-8 flex items-center gap-5"><span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/12" />{sep}<span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/12" /></div>}
                  <MessageView m={m} mine={m.senderId === me.id} sender={s.users[m.senderId]} showName={showName} showAvatar={showAvatar} tail={tail}
                    seen={seenFor(m)} onReply={setReply} onImage={onImage} highlight={needle || undefined} />
                </div>
              ))}
              <AnimatePresence>
                {typers.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-1 ml-12 inline-flex items-center gap-1 rounded-[22px] rounded-bl-[6px] border border-white/10 bg-[#0e0e10] px-5 py-3.5 text-mute" aria-label="Typing">
                    <i className="dot" /><i className="dot" /><i className="dot" />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {newBelow > 0 && (
          <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => { toBottom(true); setNewBelow(0); }}
            className="btn btn-sm absolute bottom-32 left-1/2 z-20 -translate-x-1/2"><ArrowDown size={13} /> {newBelow} new</motion.button>
        )}
      </AnimatePresence>

      <Composer convId={conv.id} reply={reply} clearReply={() => setReply(null)} />
    </div>
  );
}

const HeaderBtn = ({ children, label, onClick, pressed }: { children: React.ReactNode; label: string; onClick: () => void; pressed?: boolean }) => (
  <button onClick={onClick} aria-label={label} title={label} aria-pressed={pressed}
    className={`grid h-10 w-10 place-items-center rounded-full border transition ${pressed ? "border-white bg-white text-black" : "border-white/14 text-mute hover:border-white/60 hover:text-white"}`}>{children}</button>
);

function Skeletons() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading messages">
      {[["l", 46, 220], ["l", 34, 150], ["r", 40, 260], ["l", 54, 300], ["r", 34, 140], ["r", 42, 200]].map(([side, h, w], i) => (
        <div key={i} className={`flex gap-2 ${side === "r" ? "justify-end" : ""}`}>
          {side === "l" && <div className="skeleton h-9 w-9 rounded-full" />}
          <div className="skeleton rounded-[22px]" style={{ height: h as number, width: w as number, animationDelay: `${i * 90}ms` }} />
        </div>
      ))}
    </div>
  );
}
