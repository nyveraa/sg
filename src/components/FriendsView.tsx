"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, KeyRound, Link2, MessageCircle, Search, Ticket, UserMinus, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { presenceLabel } from "@/lib/client/format";
import { useOnyx } from "@/lib/client/store";
import type { FriendInfo, InviteRow } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Spinner } from "./Loader";
import { Tilt } from "./Tilt";
import type { ModalKind } from "./Sidebar";

const since = (ts: number) => new Date(ts).toLocaleDateString([], { month: "long", year: "numeric" });
const when = (ts: number) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });

export function FriendsView({ onModal }: { onModal: (m: ModalKind) => void }) {
  const { s } = useOnyx();
  const [tab, setTab] = useState<"friends" | "invites">("friends");
  const dmCount = Object.values(s.convs).filter((c) => c.kind === "dm").length; // changes when someone joins or is removed

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1080px] px-5 pt-10 pb-28 md:px-10 md:pb-16">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="label mb-3">Your circle · {dmCount}</div>
            <h1 className="display text-[clamp(2.6rem,6vw,4.4rem)]">Friends <em>&amp; invites.</em></h1>
          </div>
          <div className="flex gap-2.5">
            <button onClick={() => onModal("code")} className="btn btn-ghost"><KeyRound size={14} /> Enter a code</button>
            <button onClick={() => onModal("invite")} className="btn"><Ticket size={14} /> New invite</button>
          </div>
        </header>

        <div className="mb-8 flex gap-8 border-b border-white/10" role="tablist">
          {(["friends", "invites"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`relative pb-4 text-[13px] tracking-[0.18em] uppercase transition ${tab === t ? "text-white" : "text-mute hover:text-white"}`}>
              {t}{tab === t && <motion.span layoutId="friends-tab" className="absolute inset-x-0 -bottom-px h-px bg-white" />}
            </button>
          ))}
        </div>

        {tab === "friends" ? <FriendGrid dmCount={dmCount} onModal={onModal} /> : <InviteList dmCount={dmCount} onModal={onModal} />}
      </div>
    </div>
  );
}

function FriendGrid({ dmCount, onModal }: { dmCount: number; onModal: (m: ModalKind) => void }) {
  const { s, setActive, unfriend, toast, showProfile } = useOnyx();
  const [list, setList] = useState<FriendInfo[] | null>(null);
  const [q, setQ] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [confirm, setConfirm] = useState<FriendInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    api<{ friends: FriendInfo[] }>("GET", "/api/friends").then((r) => !dead && setList(r.friends)).catch(() => !dead && setList([]));
    return () => { dead = true; };
  }, [dmCount]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list ?? []).map((f) => ({ ...f, user: s.users[f.user.id] ?? f.user }))
      .filter((f) => (!onlineOnly || f.user.online) && (!needle || f.user.displayName.toLowerCase().includes(needle) || f.user.username.includes(needle)));
  }, [list, s.users, q, onlineOnly]);

  const groupsWith = (id: string) => Object.values(s.convs).filter((c) => c.kind === "group" && c.memberIds.includes(id)).length;

  async function remove() {
    if (!confirm) return;
    setBusy(true);
    try { await unfriend(confirm.user.id); toast(`Removed ${confirm.user.displayName}`, "ok"); setConfirm(null); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't remove friend", "error"); }
    setBusy(false);
  }

  if (list === null) return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-64 rounded-[22px]" style={{ animationDelay: `${i * 100}ms` }} />)}</div>;

  if (list.length === 0)
    return (
      <div className="card mx-auto max-w-lg p-12 text-center">
        <p className="display text-[40px]">No one <em>yet.</em></p>
        <p className="mx-auto mt-3 max-w-xs text-[15px] text-mute">Your circle grows one invitation at a time. Generate a link and send it to someone you trust.</p>
        <button onClick={() => onModal("invite")} className="btn mt-8"><Ticket size={14} /> Get invite link</button>
      </div>
    );

  return (
    <>
      <div className="mb-7 flex flex-wrap items-center gap-4">
        <label className="box flex min-w-[240px] flex-1 items-center gap-3 px-5 py-2.5 sm:max-w-sm">
          <Search size={15} className="text-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends" aria-label="Search friends" className="w-full bg-transparent text-sm outline-none placeholder:text-dim" />
        </label>
        <button onClick={() => setOnlineOnly((v) => !v)} aria-pressed={onlineOnly} className={`rounded-full border px-5 py-2.5 text-[12px] tracking-[0.16em] uppercase transition ${onlineOnly ? "border-white bg-white text-black" : "border-white/20 text-mute hover:text-white"}`}>Online only</button>
        <span className="ml-auto text-[13px] text-mute italic">{shown.length} of {list.length}</span>
      </div>

      {shown.length === 0 && <p className="py-16 text-center text-mute italic">No friends match.</p>}
      <div className="grid gap-5 [perspective:1600px] sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {shown.map((f, i) => (
            <motion.div key={f.user.id} layout initial={{ opacity: 0, y: 40, rotateX: -14 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, scale: 0.9, rotateY: 30 }}
              transition={{ duration: 0.6, delay: Math.min(i, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}>
              <Tilt className="card flex h-full flex-col p-6" max={6}>
                <div className="mb-6 flex items-start justify-between">
                  <button onClick={() => showProfile(f.user.id)} aria-label={`${f.user.displayName}'s profile`} className="rounded-full transition hover:opacity-80"><Avatar user={f.user} size={72} online={f.user.online} /></button>
                  <span className="label mt-1 text-right">{presenceLabel(f.user)}</span>
                </div>
                <h3 className="display text-[30px]">{f.user.displayName}</h3>
                <div className="mt-1.5 text-[12.5px] text-mute">@{f.user.username}</div>
                <p className="mt-4 line-clamp-2 min-h-[2.8em] text-[14.5px] leading-relaxed text-white/70 italic">{f.user.status ? `“${f.user.status}”` : f.user.bio || "No bio yet."}</p>
                <div className="mt-5 flex gap-4 border-t border-white/10 pt-4 text-[12px] text-mute">
                  <span>Friends since {since(f.since)}</span>
                  {groupsWith(f.user.id) > 0 && <span>· {groupsWith(f.user.id)} shared group{groupsWith(f.user.id) > 1 ? "s" : ""}</span>}
                </div>
                <div className="mt-5 grid grid-cols-[1fr_auto] gap-2.5">
                  <button onClick={() => f.convId && setActive(f.convId)} disabled={!f.convId} className="btn btn-sm"><MessageCircle size={14} /> Message</button>
                  <button onClick={() => setConfirm(f)} aria-label={`Remove ${f.user.displayName}`} title="Remove friend" className="grid h-[38px] w-[38px] place-items-center rounded-full border border-white/18 text-mute transition hover:border-red-400/70 hover:text-red-300"><UserMinus size={15} /></button>
                </div>
              </Tilt>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Modal open={!!confirm} onClose={() => !busy && setConfirm(null)} title={confirm ? `Remove ${confirm.user.displayName}?` : ""} eyebrow="This can’t be undone" width={470}>
        <p className="text-[15.5px] leading-relaxed text-white/75">
          You’ll stop being friends, and your one-to-one chat — every message in it — is deleted for <em>both</em> of you. Group chats you share stay as they are.
          To reconnect, one of you will need to send a fresh invite.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <button onClick={() => setConfirm(null)} disabled={busy} className="btn btn-ghost">Keep friend</button>
          <button onClick={remove} disabled={busy} className="btn btn-danger">{busy ? <Spinner /> : <><UserMinus size={14} /> Remove</>}</button>
        </div>
      </Modal>
    </>
  );
}

function InviteList({ dmCount, onModal }: { dmCount: number; onModal: (m: ModalKind) => void }) {
  const { toast } = useOnyx();
  const [list, setList] = useState<InviteRow[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const load = useCallback(() => api<{ invites: InviteRow[] }>("GET", "/api/invites").then((r) => setList(r.invites)).catch(() => setList([])), []);
  useEffect(() => { void load(); }, [load, dmCount]); // a used invite flips to "used" the moment the friend joins

  const link = (code: string) => `${location.origin}/join/${code}`;
  const pretty = (code: string) => `${code.slice(0, 4)}–${code.slice(4)}`;

  async function copy(code: string) {
    try { await navigator.clipboard.writeText(link(code)); setCopied(code); setTimeout(() => setCopied(null), 1600); toast("Invite link copied", "ok"); }
    catch { toast("Couldn't copy — select it manually", "error"); }
  }
  async function revoke(code: string) {
    try { await api("DELETE", `/api/invites/${code}`); toast("Invite revoked", "ok"); void load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't revoke", "error"); }
  }

  if (list === null) return <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>;
  if (list.length === 0)
    return (
      <div className="card mx-auto max-w-lg p-12 text-center">
        <p className="display text-[40px]">No invites <em>yet.</em></p>
        <p className="mx-auto mt-3 max-w-xs text-[15px] text-mute">Each invite is a single-use code that opens one door. Make one and send it.</p>
        <button onClick={() => onModal("invite")} className="btn mt-8"><Ticket size={14} /> Create invite</button>
      </div>
    );

  return (
    <ul className="space-y-3">
      <AnimatePresence initial={false}>
        {list.map((inv) => (
          <motion.li key={inv.code} layout initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5">
            <span className={`font-mono text-[22px] tracking-[0.1em] ${inv.status === "pending" ? "metal" : "text-dim line-through"}`}>{pretty(inv.code)}</span>
            <span className={`rounded-full border px-3 py-1 text-[10.5px] tracking-[0.18em] uppercase ${inv.status === "pending" ? "border-white/60 text-white" : inv.status === "used" ? "border-white/20 text-mute" : "border-white/10 text-dim"}`}>
              {inv.status}
            </span>
            <span className="min-w-0 flex-1 text-[13.5px] text-mute">
              {inv.status === "used" && inv.usedBy ? <>Used by <b className="font-medium text-white">{inv.usedBy.displayName}</b> <span className="text-dim">@{inv.usedBy.username}</span></>
                : inv.status === "pending" ? <>Expires {when(inv.expiresAt)}</> : <>Expired {when(inv.expiresAt)}</>}
            </span>
            {inv.status === "pending" && (
              <div className="flex gap-2">
                <button onClick={() => copy(inv.code)} className="btn btn-ghost btn-sm">{copied === inv.code ? <Check size={13} /> : <Link2 size={13} />} Copy link</button>
                <button onClick={() => revoke(inv.code)} aria-label={`Revoke ${pretty(inv.code)}`} className="grid h-[38px] w-[38px] place-items-center rounded-full border border-white/18 text-mute transition hover:border-red-400/70 hover:text-red-300"><X size={15} /></button>
              </div>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
