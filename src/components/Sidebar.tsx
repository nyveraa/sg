"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { KeyRound, Search, Ticket, Users } from "lucide-react";
import { convName, convPeer, useOnyx } from "@/lib/client/store";
import type { Conversation, Message, User } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Mark } from "./Logo";
import { Tilt } from "./Tilt";

export type ModalKind = "code" | "invite" | "group" | "profile" | "story";

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function previewOf(m: Message | null, users: Record<string, User>, meId: string) {
  if (!m) return "No messages yet";
  const who = m.senderId === meId ? "You: " : "";
  if (m.deleted) return "Message deleted";
  switch (m.kind) {
    case "image": return `${who}Photo`;
    case "voice": return `${who}Voice message · ${fmtDur((m.data as { duration: number }).duration)}`;
    case "roll": return `${who}rolled a ${(m.data as { result: number }).result}`;
    case "flip": return `${who}flipped ${(m.data as { result: string }).result}`;
    case "ball": return `${who}asked the 8-ball`;
    case "poll": return `${who}Poll — ${m.body}`;
    case "ttt": return `${who}Tic-Tac-Toe`;
    case "c4": return `${who}Connect Four`;
    case "rps": return `${who}Rock · Paper · Scissors`;
    case "prompt": return `${who}${m.body === "truth" ? "Truth" : "Dare"}: ${(m.data as { text: string }).text}`;
    case "effect": return `${who}sent ${(m.data as { effect: string }).effect}`;
    case "system": return `${users[m.senderId]?.displayName ?? "Someone"} ${m.body}`;
    default: return who + m.body;
  }
}

export function timeShort(ts: number) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - ts < 6 * 864e5) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** The conversation list. */
export function Sidebar({ onModal, className = "" }: { onModal: (m: ModalKind) => void; className?: string }) {
  const { s, active, setActive, friends } = useOnyx();
  const [q, setQ] = useState("");
  const me = s.me!;

  const convs = useMemo(() => {
    const list = Object.values(s.convs).sort((a, b) => b.updatedAt - a.updatedAt);
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((c) => convName(c, s.users, me.id).toLowerCase().includes(needle)) : list;
  }, [s.convs, s.users, q, me.id]);

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

      <div className="px-5 pb-4">
        <label className="box flex items-center gap-3 px-4 py-2.5">
          <Search size={15} className="text-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search chats" className="w-full bg-transparent text-sm outline-none placeholder:text-dim" />
        </label>
      </div>

      {onlineFriends.length > 0 && (
        <div className="px-6 pb-4">
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
        {convs.length === 0 && !q && <EmptyCircle onModal={onModal} />}
        {convs.length === 0 && q && <p className="label px-5 py-10 text-center">No chats match “{q}”</p>}
        <AnimatePresence initial={false}>
          {convs.map((c) => <Row key={c.id} c={c} active={active === c.id} onClick={() => setActive(c.id)} />)}
        </AnimatePresence>
      </nav>
    </aside>
  );
}

function Row({ c, active, onClick }: { c: Conversation; active: boolean; onClick: () => void }) {
  const { s } = useOnyx();
  const me = s.me!;
  const peer = convPeer(c, s.users, me.id);
  const typingNow = Object.entries(s.typing[c.id] ?? {}).some(([id, t]) => id !== me.id && Date.now() - t < 3500);
  return (
    <motion.button layout="position" onClick={onClick} initial={{ opacity: 0, x: -16, rotateY: 18 }} animate={{ opacity: 1, x: 0, rotateY: 0 }}
      exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 340, damping: 30 }} aria-current={active ? "true" : undefined}
      className={`group relative mb-1 flex w-full items-center gap-4 rounded-2xl px-3.5 py-3.5 text-left transition ${active ? "bg-white/[0.07] shadow-[0_0_0_1px_rgb(255_255_255/.1)_inset]" : "hover:bg-white/[0.04]"}`}>
      <Avatar user={peer} group={c.kind === "group"} size={50} online={c.kind === "dm" ? peer?.online : undefined} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-display text-[19px] leading-none">{convName(c, s.users, me.id)}</span>
          <span className="ml-auto shrink-0 text-[11px] text-dim">{c.last ? timeShort(c.last.createdAt) : ""}</span>
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className={`truncate text-[13.5px] ${c.unread ? "text-white" : "text-mute"}`}>
            {typingNow ? <span className="italic">typing…</span> : previewOf(c.last, s.users, me.id)}
          </span>
          {c.unread > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-white px-1.5 text-[10.5px] font-bold text-black">
              {c.unread > 99 ? "99+" : c.unread}
            </motion.span>
          )}
        </span>
      </span>
    </motion.button>
  );
}

function EmptyCircle({ onModal }: { onModal: (m: ModalKind) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-3 [perspective:900px]">
      <Tilt className="card p-7" max={6}>
        <Mark size={44} className="mb-7 text-white" />
        <div className="label mb-2">Nothing here yet</div>
        <h2 className="display text-[32px]">An empty <em>room.</em></h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-mute">onyx is invite-only. Generate your link and send it — or enter a code someone gave you.</p>
        <div className="mt-7 grid gap-2.5">
          <button onClick={() => onModal("invite")} className="btn justify-between"><span>Get invite link</span><Ticket size={15} /></button>
          <button onClick={() => onModal("code")} className="btn btn-ghost justify-between"><span>I have a code</span><KeyRound size={15} /></button>
        </div>
      </Tilt>
    </motion.div>
  );
}
