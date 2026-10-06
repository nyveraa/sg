"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Archive, BellOff, Check, Download, LogOut, Pencil, Pin, Plus, Send, UserPlus } from "lucide-react";
import { convName, convPeer, useOnyx } from "@/lib/client/store";
import { presenceLabel, previewOf } from "@/lib/client/format";
import { useChatWallpaper } from "@/lib/client/wallpaper";
import { WALLPAPERS } from "@/lib/prefs";
import type { Conversation, Message } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Spinner } from "./Loader";
import { Tilt } from "./Tilt";

const Row = ({ label, hint, on, onClick, icon: Icon }: { label: string; hint: string; on: boolean; onClick: () => void; icon: typeof Pin }) => (
  <button onClick={onClick} role="switch" aria-checked={on} className="flex w-full items-center gap-4 rounded-2xl border border-white/10 px-4 py-3.5 text-left transition hover:border-white/30">
    <Icon size={17} strokeWidth={1.5} className={on ? "text-white" : "text-mute"} />
    <span className="min-w-0 flex-1"><span className="block text-[14.5px]">{label}</span><span className="block text-[12px] text-mute">{hint}</span></span>
    <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? "bg-white" : "bg-white/15"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${on ? "left-[18px] bg-black" : "left-0.5 bg-white/70"}`} /></span>
  </button>
);

export function ChatInfo({ conv, open, onClose, onImage }: { conv: Conversation; open: boolean; onClose: () => void; onImage: (src: string) => void }) {
  const { s, friends, setConvPrefs, setNickname, renameGroup, addMembers, leaveGroup, toast } = useOnyx();
  const me = s.me!;
  const peer = convPeer(conv, s.users, me.id);
  const [chatWp, setChatWp] = useChatWallpaper(conv.id);
  const [nick, setNick] = useState("");
  const [title, setTitle] = useState(conv.title ?? "");
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => { if (open) { setNick(peer && s.users[peer.id]?.realName ? s.users[peer.id].displayName : ""); setTitle(conv.title ?? ""); setAdding(false); setPicked([]); setConfirmLeave(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const media = useMemo(() => (s.msgs[conv.id] ?? []).filter((m) => m.kind === "image" && !m.deleted && m.id > 0).reverse(), [s.msgs, conv.id]);
  const addable = friends.filter((f) => !conv.memberIds.includes(f.id));

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast(ok, "ok"); } catch (e) { toast(e instanceof Error ? e.message : "Something went wrong", "error"); }
    setBusy(false);
  }

  function exportChat() {
    const lines = (s.msgs[conv.id] ?? []).filter((m) => m.id > 0 && !m.deleted).map((m: Message) =>
      `[${new Date(m.createdAt).toLocaleString()}] ${m.kind === "system" ? "—" : (s.users[m.senderId]?.displayName ?? "?")}: ${m.kind === "text" ? m.body : previewOf(m, s.users, "")}`);
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${convName(conv, s.users, me.id)}.txt` });
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <Modal open={open} onClose={onClose} title={conv.kind === "group" ? "Group" : "Chat info"} eyebrow={convName(conv, s.users, me.id)} width={520}>
      {conv.kind === "dm" && peer && (
        <>
          <Tilt className="card mb-6 flex items-center gap-5 p-5" max={6}>
            <Avatar user={peer} size={76} online={peer.online} />
            <div className="min-w-0">
              <div className="display truncate text-[30px]">{peer.displayName}</div>
              <div className="mt-1 truncate text-[12.5px] text-mute">@{peer.username}{peer.realName ? ` · ${peer.realName}` : ""}{peer.pronouns ? ` · ${peer.pronouns}` : ""}</div>
              <div className="label mt-2">{presenceLabel(peer)}</div>
            </div>
          </Tilt>
          {(peer.status || peer.bio) && <p className="mb-6 text-[15px] leading-relaxed text-white/75 italic">{peer.status ? `“${peer.status}”` : ""}{peer.status && peer.bio ? " — " : ""}{peer.bio}</p>}
          <form className="mb-7" onSubmit={(e) => { e.preventDefault(); void run(() => setNickname(peer.id, nick), nick ? "Nickname saved" : "Nickname removed"); }}>
            <label className="block"><span className="label">Private nickname <span className="normal-case tracking-normal text-dim">— only you see it</span></span>
              <div className="flex items-end gap-3"><input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={40} placeholder={peer.realName ?? peer.displayName} className="field" />
                <button disabled={busy} className="btn btn-sm shrink-0"><Pencil size={13} /> Save</button></div></label>
          </form>
        </>
      )}

      {conv.kind === "group" && (
        <div className="mb-7">
          <form onSubmit={(e) => { e.preventDefault(); if (title.trim() && title.trim() !== conv.title) void run(() => renameGroup(conv.id, title.trim()), "Group renamed"); }}>
            <label className="block"><span className="label">Group name</span>
              <div className="flex items-end gap-3"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} className="field" />
                <button disabled={busy || !title.trim() || title.trim() === conv.title} className="btn btn-sm shrink-0"><Check size={13} /> Rename</button></div></label>
          </form>

          <div className="mt-6 mb-3 flex items-center justify-between"><span className="label">{conv.memberIds.length} members</span>
            <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 text-[12.5px] text-mute transition hover:text-white"><Plus size={13} /> Add people</button></div>
          {adding ? (
            <div className="rounded-2xl border border-white/12 p-2">
              {addable.length === 0 && <p className="px-3 py-5 text-center text-[13.5px] text-mute italic">All your friends are already here.</p>}
              <div className="max-h-48 overflow-y-auto">
                {addable.map((f) => (
                  <button key={f.id} onClick={() => setPicked((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))} aria-pressed={picked.includes(f.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${picked.includes(f.id) ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"}`}>
                    <Avatar user={f} size={32} /><span className="flex-1 truncate font-display text-[17px]">{f.displayName}</span>{picked.includes(f.id) && <Check size={15} />}
                  </button>
                ))}
              </div>
              {addable.length > 0 && <button disabled={busy || !picked.length} onClick={() => void run(async () => { await addMembers(conv.id, picked); setAdding(false); setPicked([]); }, "Added to the group")} className="btn btn-sm mt-2 w-full"><UserPlus size={13} /> Add {picked.length || ""}</button>}
            </div>
          ) : (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {conv.memberIds.map((id) => (
                <li key={id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                  <Avatar user={s.users[id]} size={36} online={id === me.id ? undefined : s.users[id]?.online} />
                  <div className="min-w-0 flex-1"><div className="truncate font-display text-[17px] leading-none">{id === me.id ? "You" : s.users[id]?.displayName}</div>
                    <div className="mt-1 truncate text-[11.5px] text-mute">{id === me.id ? "" : presenceLabel(s.users[id])}</div></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-7 space-y-2.5">
        <Row icon={Pin} label="Pin to top" hint="Keeps this chat first in your list" on={conv.pinned} onClick={() => setConvPrefs(conv.id, { pinned: !conv.pinned })} />
        <Row icon={BellOff} label="Mute" hint="No sounds or notifications for this chat" on={conv.muted} onClick={() => setConvPrefs(conv.id, { muted: !conv.muted })} />
        <Row icon={Archive} label="Archive" hint="Tucks it away until someone writes again" on={conv.archived} onClick={() => setConvPrefs(conv.id, { archived: !conv.archived })} />
      </div>

      <div className="mb-7">
        <div className="label mb-3">Wallpaper for this chat</div>
        <div className="flex flex-wrap gap-2">
          {[null, ...WALLPAPERS].map((w) => {
            const on = (chatWp ?? null) === w;
            return <button key={w ?? "default"} onClick={() => setChatWp(w)} aria-pressed={on} className={`rounded-full border px-3.5 py-1.5 text-[12px] capitalize transition ${on ? "border-white bg-white text-black" : "border-white/14 text-mute hover:text-white"}`}>{w ?? "Default"}</button>;
          })}
        </div>
      </div>

      <div className="mb-7">
        <div className="label mb-3">Shared photos · {media.length}</div>
        {media.length === 0 ? <p className="text-[13.5px] text-mute italic">Photos and sketches you share appear here.</p> : (
          <div className="grid grid-cols-4 gap-1.5">
            {media.slice(0, 12).map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <motion.img key={m.id} whileHover={{ scale: 1.04 }} src={m.body} alt="Shared" onClick={() => onImage(m.body)} className="aspect-square w-full cursor-zoom-in rounded-xl border border-white/10 object-cover" />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button onClick={exportChat} className="btn btn-ghost btn-sm"><Download size={13} /> Export chat</button>
        {conv.kind === "group" && !confirmLeave && <button onClick={() => setConfirmLeave(true)} className="btn btn-danger btn-sm"><LogOut size={13} /> Leave group</button>}
        {conv.kind === "group" && confirmLeave && (
          <>
            <span className="self-center text-[13px] text-mute">Leave this group?</span>
            <button onClick={() => void run(async () => { await leaveGroup(conv.id); onClose(); }, "You left the group")} disabled={busy} className="btn btn-danger btn-sm">{busy ? <Spinner /> : "Yes, leave"}</button>
            <button onClick={() => setConfirmLeave(false)} className="btn btn-ghost btn-sm">Stay</button>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Pick a chat to forward a text or photo message into. */
export function ForwardModal({ message, onClose, fromConv }: { message: Message | null; onClose: () => void; fromConv: string }) {
  const { s, send, toast } = useOnyx();
  const me = s.me!;
  const [q, setQ] = useState("");
  const list = Object.values(s.convs).filter((c) => c.id !== fromConv && convName(c, s.users, me.id).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  async function go(c: Conversation) {
    if (!message) return;
    const ok = await send(c.id, message.kind === "image" ? { image: message.body } : { body: message.body });
    if (ok) { toast(`Forwarded to ${convName(c, s.users, me.id)}`, "ok"); onClose(); }
  }

  return (
    <Modal open={!!message} onClose={onClose} title="Forward to…" eyebrow="Choose a chat" width={440}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="field mb-4" autoFocus />
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {list.length === 0 && <p className="py-8 text-center text-[14px] text-mute italic">No other chats.</p>}
        {list.map((c) => (
          <button key={c.id} onClick={() => void go(c)} className="flex w-full items-center gap-4 rounded-2xl px-3.5 py-2.5 text-left transition hover:bg-white/[0.06]">
            <Avatar user={convPeer(c, s.users, me.id)} group={c.kind === "group"} size={40} />
            <span className="min-w-0 flex-1 truncate font-display text-[19px]">{convName(c, s.users, me.id)}</span><Send size={15} className="text-mute" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
