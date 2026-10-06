"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Copy, KeyRound, Link2, RefreshCw, Share2, Ticket, UserPlus, Users } from "lucide-react";
import { useOnyx } from "@/lib/client/store";
import { Avatar } from "./Avatar";
import { Wordmark } from "./Logo";
import { Modal } from "./Modal";
import { Spinner } from "./Loader";
import { HeroScene } from "./Scene";
import { Tilt } from "./Tilt";

const CODE_CHARS = /[^A-HJ-NP-Z2-9]/g; // matches the server alphabet (no 0/O/1/I)
/** Accepts a bare code, "ABCD-EFGH", or a full /join/ link. */
export const cleanCode = (v: string) => (/join\/([A-Za-z0-9-]+)/.exec(v)?.[1] ?? v).toUpperCase().replace(CODE_CHARS, "").slice(0, 8);

function useCopy() {
  const { toast } = useOnyx();
  return async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`, "ok"); }
    catch { toast("Couldn't copy — select it manually", "error"); }
  };
}

/* ───────────── (+) add friend ───────────── */

export function FriendModal({ open, tab, setTab, onClose }: { open: boolean; tab: "code" | "invite"; setTab: (t: "code" | "invite") => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add a friend" eyebrow="By invitation only" width={480}>
      <div className="mb-7 grid grid-cols-2 rounded-full border border-white/14 p-1">
        {([["code", "Enter a code", KeyRound], ["invite", "Get invite link", Ticket]] as const).map(([k, label, I]) => (
          <button key={k} onClick={() => setTab(k)} className="relative flex items-center justify-center gap-2 rounded-full py-2.5 text-[11.5px] tracking-[0.14em] uppercase transition" style={{ color: tab === k ? "#000" : "#92929a" }}>
            {tab === k && <motion.span layoutId="friend-tab" className="absolute inset-0 rounded-full bg-gradient-to-b from-white to-[#d2d2d7]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative flex items-center gap-2 font-semibold"><I size={13} />{label}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, x: tab === "code" ? -20 : 20, rotateY: tab === "code" ? 10 : -10 }} animate={{ opacity: 1, x: 0, rotateY: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {tab === "code" ? <EnterCode onDone={onClose} /> : <InviteTicket />}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}

function EnterCode({ onDone }: { onDone: () => void }) {
  const { redeem } = useOnyx();
  const [code, setCode] = useState("");
  const [focus, setFocus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  async function go() {
    if (code.length !== 8 || busy) return;
    setBusy(true); setError("");
    try { await redeem(code); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); setShake((n) => n + 1); setBusy(false); }
  }

  return (
    <div>
      <p className="mb-6 text-[15px] leading-relaxed text-mute">Got a code from a friend? Enter it — you’ll be connected instantly and a chat opens.</p>
      <motion.div key={shake} animate={shake ? { x: [0, -10, 9, -6, 3, 0] } : undefined} transition={{ duration: 0.4 }}
        className="relative mb-2 flex justify-center gap-1.5" onClick={() => input.current?.focus()}>
        <input ref={input} value={code} onChange={(e) => { setCode(cleanCode(e.target.value)); setError(""); }} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          onKeyDown={(e) => e.key === "Enter" && void go()} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Invite code" aria-invalid={!!error}
          className="absolute inset-0 z-10 w-full cursor-text opacity-0" />
        {Array.from({ length: 8 }, (_, i) => {
          const on = focus && i === Math.min(code.length, 7);
          return (
            <span key={i} className="contents">
              {i === 4 && <span className="self-center px-1 text-dim">—</span>}
              <span className={`grid h-14 w-9 place-items-center rounded-xl border font-mono text-xl font-medium transition sm:w-10 ${on ? "border-white shadow-[0_0_24px_-6px_#fff]" : code[i] ? "border-white/60 bg-white/[0.05]" : "border-white/14"}`}>
                {code[i] && <motion.span key={code[i] + i} initial={{ y: -12, opacity: 0, rotateX: -80 }} animate={{ y: 0, opacity: 1, rotateX: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>{code[i]}</motion.span>}
                {!code[i] && on && <span className="h-6 w-px animate-pulse bg-white" />}
              </span>
            </span>
          );
        })}
      </motion.div>
      <div aria-live="polite" className="min-h-9 pt-2 text-center text-[13px] text-white/75 italic">{error}</div>
      <button onClick={go} disabled={code.length !== 8 || busy} className="btn w-full justify-between">
        <span>Connect</span>{busy ? <Spinner /> : <UserPlus size={16} />}
      </button>
    </div>
  );
}

function InviteTicket() {
  const { mint, toast } = useOnyx();
  const copy = useCopy();
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function generate() {
    setBusy(true);
    try { setInvite(await mint()); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't create invite", "error"); }
    setBusy(false);
  }

  if (!invite)
    return (
      <div>
        <p className="mb-7 text-[15px] leading-relaxed text-mute">Ask for a fresh invite. Send the link or code to a friend — when they use it, you’re connected and can chat. Single use, valid for 7 days.</p>
        <button onClick={generate} disabled={busy} className="btn w-full justify-between"><span>Generate invite link</span>{busy ? <Spinner /> : <ArrowRight size={16} />}</button>
      </div>
    );

  const link = `${location.origin}/join/${invite.code}`;
  const pretty = `${invite.code.slice(0, 4)}–${invite.code.slice(4)}`;
  const days = Math.max(1, Math.round((invite.expiresAt - Date.now()) / 864e5));
  const done = (k: "code" | "link") => { setCopied(k); setTimeout(() => setCopied(null), 1600); };

  return (
    <div className="[perspective:1000px]">
      <motion.div initial={{ rotateX: -55, y: -26, opacity: 0 }} animate={{ rotateX: 0, y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 160, damping: 17 }}>
        <Tilt className="card overflow-hidden p-6" max={10}>
          <div className="sheen pointer-events-none absolute inset-0" />
          <div className="flex items-center justify-between">
            <Wordmark size={24} />
            <span className="label">Single use</span>
          </div>
          <div className="my-8 flex justify-center font-mono text-[32px] font-medium tracking-[0.12em] sm:text-4xl" aria-label={`Invite code ${pretty}`}>
            {pretty.split("").map((ch, i) => (
              <motion.span key={i} initial={{ opacity: 0, y: 12, rotateX: -90 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.25 + i * 0.06, type: "spring", stiffness: 300, damping: 18 }}
                className={ch === "–" ? "text-dim" : "metal"}>{ch}</motion.span>
            ))}
          </div>
          <div className="relative -mx-6 my-4 border-t border-dashed border-white/20">
            <span className="absolute -top-2.5 -left-2.5 h-5 w-5 rounded-full bg-[#050506] ring-1 ring-white/15" /><span className="absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full bg-[#050506] ring-1 ring-white/15" />
          </div>
          <div className="truncate font-mono text-[11px] text-mute">{link}</div>
        </Tilt>
      </motion.div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <button onClick={() => { void copy(pretty, "Code"); done("code"); }} className="btn btn-ghost">{copied === "code" ? <Check size={14} /> : <Copy size={14} />} Code</button>
        <button onClick={() => { void copy(link, "Link"); done("link"); }} className="btn">{copied === "link" ? <Check size={14} /> : <Link2 size={14} />} Link</button>
      </div>
      {typeof navigator !== "undefined" && "share" in navigator && (
        <button onClick={() => void navigator.share({ title: "Join me on Whisper", text: `Use my Whisper invite code ${pretty}`, url: link }).catch(() => {})} className="btn btn-ghost mt-2.5 w-full"><Share2 size={14} /> Share</button>
      )}
      <div className="mt-6 flex items-center justify-between text-[12.5px] text-mute italic">
        <span>Expires in ~{days} days</span>
        <button onClick={generate} disabled={busy} className="flex items-center gap-1.5 not-italic transition hover:text-white"><RefreshCw size={12} className={busy ? "animate-spin" : ""} /> New code</button>
      </div>
    </div>
  );
}

/* ───────────── group ───────────── */

export function GroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { friends, createGroup, toast } = useOnyx();
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(""); setPicked([]); } }, [open]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function create() {
    setBusy(true);
    try { await createGroup(title.trim(), picked); onClose(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't create group", "error"); }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="New group" eyebrow="Bring a few people together">
      <label className="mb-7 block"><span className="label">Group name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The crew" maxLength={40} className="field" /></label>
      <div className="label mb-3">Pick at least two friends · {picked.length} selected</div>
      <div className="max-h-60 space-y-1 overflow-y-auto">
        {friends.length === 0 && <p className="py-8 text-center text-[14px] text-mute italic">Add friends first with +</p>}
        {friends.map((f) => (
          <button key={f.id} onClick={() => toggle(f.id)} aria-pressed={picked.includes(f.id)}
            className={`flex w-full items-center gap-4 rounded-2xl px-3.5 py-2.5 text-left transition ${picked.includes(f.id) ? "bg-white/[0.09] shadow-[0_0_0_1px_rgb(255_255_255/.2)_inset]" : "hover:bg-white/[0.05]"}`}>
            <Avatar user={f} size={38} online={f.online} /><span className="flex-1 truncate font-display text-[18px]">{f.displayName}</span>
            {picked.includes(f.id) && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={16} /></motion.span>}
          </button>
        ))}
      </div>
      <button onClick={create} disabled={busy || !title.trim() || picked.length < 2} className="btn mt-7 w-full justify-between"><span>Create group</span>{busy ? <Spinner /> : <Users size={16} />}</button>
    </Modal>
  );
}

/* ───────────── celebration / lightbox / toasts ───────────── */

export function Celebration() {
  const { celebration, closeCelebration, setActive, s } = useOnyx();
  useEffect(() => {
    if (!celebration) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeCelebration();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [celebration, closeCelebration]);

  return (
    <AnimatePresence>
      {celebration && (
        <motion.div role="dialog" aria-modal="true" aria-label="Friend connected" className="fixed inset-0 z-[120] bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCelebration}>
          {s.me?.prefs.effects === "full" && <div className="absolute inset-0 opacity-70"><HeroScene compact /></div>}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(0_0_0/.72)_20%,#000_90%)]" />
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="relative text-center [perspective:900px]" onClick={(e) => e.stopPropagation()}>
              <div className="relative flex items-center justify-center gap-24">
                <motion.div initial={{ x: -240, rotateY: -110, opacity: 0 }} animate={{ x: 0, rotateY: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 110, damping: 15, delay: 0.1 }}>
                  <Avatar user={s.me ?? undefined} size={112} className="ring-4 ring-black" />
                </motion.div>
                <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.7, duration: 0.5 }} className="absolute left-1/2 h-px w-24 -translate-x-1/2 bg-white" />
                <motion.div initial={{ x: 240, rotateY: 110, opacity: 0 }} animate={{ x: 0, rotateY: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 110, damping: 15, delay: 0.1 }}>
                  <Avatar user={celebration.user} size={112} className="ring-4 ring-black" />
                </motion.div>
              </div>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="label mt-10">Connection established</motion.p>
              <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }} className="display metal mt-3 text-[clamp(3rem,8vw,5.5rem)]">You’re <em>connected.</em></motion.h2>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.15 }} className="mt-4 text-[16px] text-mute">You and <b className="font-display text-[19px] font-medium text-white">{celebration.user.displayName}</b> are now friends.</motion.p>
              <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }} onClick={() => { setActive(celebration.convId); closeCelebration(); }} className="btn mt-10">
                Start chatting <ArrowRight size={15} />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);
  return (
    <AnimatePresence>
      {src && (
        <motion.div className="fixed inset-0 z-[110] grid place-items-center bg-black/95 p-4 [perspective:1200px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Image preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img src={src} alt="Full size" initial={{ scale: 0.75, rotateX: 22, opacity: 0 }} animate={{ scale: 1, rotateX: 0, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }} className="max-h-[90dvh] max-w-full rounded-2xl border border-white/15" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toasts() {
  const { toasts } = useOnyx();
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[160] flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-8" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 20, rotateX: -30 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0 }}
            className="rounded-full border border-white/25 bg-black/95 px-6 py-3 text-[13.5px] text-white shadow-2xl backdrop-blur">{t.tone === "error" ? "✕  " : t.tone === "ok" ? "✓  " : ""}{t.text}</motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
