"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellOff, KeyRound, Pin, Search, Ticket, Users } from "lucide-react";
import { convName, convPeer, useOnyx } from "@/lib/client/store";
import { previewOf, timeShort } from "@/lib/client/format";
import type { Conversation } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Tilt } from "./Tilt";

export type ModalKind = "code" | "invite" | "group" | "settings";
type Filter = "all" | "unread" | "groups" | "archived";
const FILTERS: { id: Filter; label: string }[] = [{ id: "all", label: "All" }, { id: "unread", label: "Unread" }, { id: "groups", label: "Groups" }, { id: "archived", label: "Archived" }];

/** The conversation list. */
export function Sidebar({ onModal, className = "" }: { onModal: (m: ModalKind) => void; className?: string }) {
  const { s, active, setActive, friends } = useOnyx();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const me = s.me!;

  const counts = useMemo(() => {
    const list = Object.values(s.convs);
    return { unread: list.filter((c) => c.unread && !c.archived).length, archived: list.filter((c) => c.archived).length };
  }, [s.convs]);

  const convs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(s.convs)
      .filter((c) => {
        if (needle) return convName(c, s.users, me.id).toLowerCase().includes(needle);
        if (filter === "archived") return c.archived;
        if (c.archived) return false;
        return filter === "unread" ? c.unread > 0 : filter === "groups" ? c.kind === "group" : true;
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [s.convs, s.users, q, filter, me.id]);

  const dmByFriend = (id: string) => Object.values(s.convs).find((c) => c.kind === "dm" && c.memberIds.includes(id))?.id;
  const onlineFriends = friends.filter((f) => f.online);

  return (
    <aside className={`w-full flex-col border-r border-white/10 bg-gradient-to-b from-[#09090b]/90 to-[#030304]/90 md:w-[380px] md:shrink-0 ${className}`}>
      <header className="flex items-end justify-between px-6 pt-7 pb-4">
        <div>
          <div className="label mb-1.5">{Object.keys(s.convs).length} conversations</div>
          <h1 className="display text-[40px]">Messages</h1>
        </div>
        <button onClick={() => onModal("group")} aria-label="New group" title="New group" className="mb-1 grid h-10 w-10 place-items-center rounded-full border border-white/14 text-mute transition hover:border-white/60 hover:text-white"><Users size={16} strokeWidth={1.6} /></button>
      </header>

      <div className="px-5 pb-3">
        <label className="box flex items-center gap-3 px-4 py-2.5">
          <Search size={15} className="text-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="w-full bg-transparent text-sm outline-none placeholder:text-dim" />
          <kbd className="hidden rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-dim md:block">Ctrl K</kbd>
        </label>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-5 pb-3" role="tablist" aria-label="Filter conversations">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] transition ${filter === f.id ? "border-white bg-white text-black" : "border-white/14 text-mute hover:text-white"}`}>
            {f.label}
            {f.id === "unread" && counts.unread > 0 && <span className={`font-semibold ${filter === f.id ? "" : "text-white"}`}>{counts.unread}</span>}
            {f.id === "archived" && counts.archived > 0 && <span className="opacity-70">{counts.archived}</span>}
          </button>
        ))}
      </div>

      {onlineFriends.length > 0 && filter === "all" && !q && (
        <div className="px-6 pb-3">
          <div className="label mb-3">Online now</div>
          <div className="flex gap-4 overflow-x-auto pb-1 [perspective:600px]">
            {onlineFriends.map((f) => (
              <Tilt key={f.id} max={20} glare={false} className="shrink-0">
                <button onClick={() => { const id = dmByFriend(f.id); if (id) setActive(id); }} className="flex w-14 flex-col items-center gap-1.5" title={f.displayName}>
                  <Avatar user={f} size={50} online />
                  <span className="w-full truncate text-center text-[11px] text-mute">{f.displayName}</span>
                </button>
              </Tilt>
            ))}
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Conversations">
        {convs.length === 0 && !q && filter === "all" && <EmptyCircle onModal={onModal} />}
        {convs.length === 0 && (q || filter !== "all") && (
          <p className="px-5 py-12 text-center text-[14px] text-mute italic">{q ? `No chats match “${q}”.` : filter === "unread" ? "You're all caught up." : filter === "groups" ? "No groups yet." : "Nothing archived."}</p>
        )}
        <AnimatePresence initial={false}>
          {convs.map((c) => <Row key={c.id} c={c} active={active === c.id} onClick={() => setActive(c.id)} />)}
        </AnimatePresence>
      </nav>
    </aside>
  );
}

function Row({ c, active, onClick }: { c: Conversation; active: boolean; onClick: () => void }) {
  const { s, setConvPrefs } = useOnyx();
  const me = s.me!;
  const peer = convPeer(c, s.users, me.id);
  const typingNow = Object.entries(s.typing[c.id] ?? {}).some(([id, t]) => id !== me.id && Date.now() - t < 3000);
  return (
    <motion.div layout="position" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      initial={{ opacity: 0, x: -16, rotateY: 18 }} animate={{ opacity: 1, x: 0, rotateY: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 340, damping: 30 }}
      aria-current={active ? "true" : undefined}
      className={`group relative mb-1 flex w-full cursor-pointer items-center gap-4 rounded-2xl px-3.5 py-3.5 text-left transition ${active ? "bg-white/[0.07] shadow-[0_0_0_1px_rgb(255_255_255/.1)_inset]" : "hover:bg-white/[0.04]"}`}>
      <Avatar user={peer} group={c.kind === "group"} size={50} online={c.kind === "dm" ? peer?.online : undefined} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-display text-[19px] leading-none">{convName(c, s.users, me.id)}</span>
          {c.streak > 1 && <span className="shrink-0 text-[11px] text-mute" title={`${c.streak}-day streak`}>🔥{c.streak}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-dim">
            {c.muted && <BellOff size={11} aria-label="Muted" />}
            {c.pinned && <Pin size={11} className="fill-current" aria-label="Pinned" />}
            {c.last ? timeShort(c.last.createdAt) : ""}
          </span>
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className={`truncate text-[13.5px] ${c.unread && !c.muted ? "text-white" : "text-mute"}`}>
            {typingNow ? <span className="italic">typing…</span> : previewOf(c.last, s.users, me.id)}
          </span>
          {c.unread > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className={`ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[10.5px] font-bold ${c.muted ? "bg-white/20 text-white" : "bg-[var(--acc-a)] text-black"}`}>
              {c.unread > 99 ? "99+" : c.unread}
            </motion.span>
          )}
        </span>
      </span>
      <button onClick={(e) => { e.stopPropagation(); setConvPrefs(c.id, { pinned: !c.pinned }); }} aria-label={c.pinned ? "Unpin chat" : "Pin chat"} title={c.pinned ? "Unpin" : "Pin to top"}
        className="absolute top-2 right-2 hidden h-7 w-7 place-items-center rounded-full bg-black/70 text-mute transition group-hover:grid hover:text-white focus-visible:grid max-md:hidden"><Pin size={13} className={c.pinned ? "fill-current" : ""} /></button>
    </motion.div>
  );
}

function EmptyCircle({ onModal }: { onModal: (m: ModalKind) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-3 [perspective:900px]">
      <Tilt className="card p-7" max={6}>
        <div className="label mb-2">Nothing here yet</div>
        <h2 className="display text-[34px]">An empty <em>room.</em></h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-mute">Whisper is invite-only. Generate your link and send it — or enter a code someone gave you.</p>
        <div className="mt-7 grid gap-2.5">
          <button onClick={() => onModal("invite")} className="btn justify-between"><span>Get invite link</span><Ticket size={15} /></button>
          <button onClick={() => onModal("code")} className="btn btn-ghost justify-between"><span>I have a code</span><KeyRound size={15} /></button>
        </div>
      </Tilt>
    </motion.div>
  );
}
