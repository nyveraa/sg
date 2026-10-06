"use client";

import { memo, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CheckCheck, Copy, Mountain, Pencil, Reply, RotateCcw, Scissors, Scroll, Trash2 } from "lucide-react";
import { useOnyx } from "@/lib/client/store";
import { sfx } from "@/lib/client/sound";
import type { BallData, C4Data, EffectData, FlipData, Message, PollData, PromptData, RollData, RpsData, RpsPick, TttData, User } from "@/lib/types";
import { Avatar } from "./Avatar";
import { VoiceBubble } from "./Voice";

const QUICK = ["❤️", "😂", "🔥", "👍", "😮", "💀"];
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*\s*){1,3}$/u;
const EFFECT_ICON = { confetti: "🎉", hearts: "💜", fire: "🔥", boom: "💥", snow: "❄️", stars: "✨" } as const;

export const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 opacity-90 hover:opacity-100">{part}</a> : part)}
    </>
  );
}

type Props = {
  m: Message; mine: boolean; sender?: User; showName: boolean; showAvatar: boolean; tail: boolean;
  seen?: string; onReply: (m: Message) => void; onImage: (src: string) => void; highlight?: string;
};

export const MessageView = memo(function MessageView(p: Props) {
  const { m, mine } = p;
  if (m.kind === "system") return <SystemLine m={m} sender={p.sender} />;
  if (m.kind === "effect") return <EffectLine m={m} sender={p.sender} mine={mine} />;
  return <Bubble {...p} />;
});

function SystemLine({ m, sender }: { m: Message; sender?: User }) {
  return (
    <div className="msg-in-sys my-6 flex items-center justify-center gap-4 text-[13px] text-mute italic" id={`m-${m.id}`}>
      <span className="h-px w-10 bg-gradient-to-r from-transparent to-white/25" /><span><b className="font-medium text-white not-italic">{sender?.displayName ?? "Someone"}</b> {m.body}</span><span className="h-px w-10 bg-gradient-to-l from-transparent to-white/25" />
    </div>
  );
}

function EffectLine({ m, sender, mine }: { m: Message; sender?: User; mine: boolean }) {
  const { fxRef } = useOnyx();
  const effect = (m.data as EffectData | null)?.effect;
  if (!effect) return null;
  return (
    <div className="msg-in-sys my-6 flex justify-center" id={`m-${m.id}`}>
      <button onClick={() => fxRef.current?.(effect)} title="Play again" className="group inline-flex items-center gap-3 rounded-full border border-white/14 px-5 py-2 text-[13px] text-mute transition hover:border-white/60 hover:text-white">
        <span className="text-base">{EFFECT_ICON[effect]}</span> {mine ? "You" : sender?.displayName} sent {effect}
        {m.body && <i className="text-white">“{m.body}”</i>}
        <RotateCcw size={12} className="transition group-hover:-rotate-180" />
      </button>
    </div>
  );
}

function Bubble({ m, mine, sender, showName, showAvatar, tail, seen, onReply, onImage, highlight }: Props) {
  const { s, react, edit, remove, toast } = useOnyx();
  const [open, setOpen] = useState(false); // toolbar pinned (touch)
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const me = s.me!;
  const emojiOnly = m.kind === "text" && !m.deleted && EMOJI_ONLY.test(m.body.trim());
  const rich = !["text", "image", "voice"].includes(m.kind);
  const solid = mine && !rich; // light bubble → dark ink inside

  const shape = `rounded-[22px] ${mine ? (tail ? "rounded-br-[6px]" : "") : tail ? "rounded-bl-[6px]" : ""}`;
  const skin = solid ? "bg-gradient-to-br from-white to-[#c9c9cf] text-black shadow-[0_14px_40px_-16px_rgb(255_255_255/.45)]"
    : rich ? `bg-gradient-to-br from-[#121214] to-[#09090a] border ${mine ? "border-white/40" : "border-white/12"}`
    : "bg-gradient-to-br from-[#17171a] to-[#0b0b0d] border border-white/10";
  const ink = solid ? "text-black/50" : "text-white/45";

  async function saveEdit() {
    const body = draft.trim();
    if (!body || body === m.body) return setEditing(false);
    await edit(m.id, body);
    setEditing(false);
  }

  return (
    <div id={`m-${m.id}`} className={`group relative flex gap-3 ${mine ? "flex-row-reverse" : ""} ${tail ? "mb-5" : "mb-1"} ${mine ? "msg-in-right" : "msg-in-left"}`}>
      <div className="w-9 shrink-0 self-end">{!mine && showAvatar && <Avatar user={sender} size={34} />}</div>
      <div className={`flex max-w-[80%] min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
        {showName && !mine && <span className="mb-1.5 ml-1 font-display text-[15px] text-white/80">{sender?.displayName}</span>}

        <div className="relative" onClick={() => setOpen((v) => !v)}>
          {!m.deleted && !editing && (
            <div className={`absolute -top-11 z-20 flex items-center rounded-full border border-white/15 bg-black/95 p-1 shadow-2xl backdrop-blur transition ${mine ? "right-0" : "left-0"} ${
              open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100"}`}>
              {QUICK.map((e) => (
                <button key={e} onClick={(ev) => { ev.stopPropagation(); react(m.id, e); sfx.pop(); setOpen(false); }}
                  className="grid h-8 w-8 place-items-center rounded-full text-[15px] transition hover:scale-125 hover:bg-white/10" aria-label={`React ${e}`}>{e}</button>
              ))}
              <span className="mx-1 h-4 w-px bg-white/15" />
              <Tool label="Reply" onClick={() => { onReply(m); setOpen(false); }}><Reply size={14} /></Tool>
              {m.kind === "text" && <Tool label="Copy" onClick={() => { void navigator.clipboard?.writeText(m.body); toast("Copied", "ok"); setOpen(false); }}><Copy size={14} /></Tool>}
              {mine && m.kind === "text" && <Tool label="Edit" onClick={() => { setDraft(m.body); setEditing(true); setOpen(false); }}><Pencil size={14} /></Tool>}
              {mine && <Tool label="Delete" onClick={() => remove(m.id)}><Trash2 size={14} /></Tool>}
            </div>
          )}

          {m.deleted ? (
            <div className="rounded-[22px] border border-dashed border-white/12 px-5 py-2.5 text-[13px] text-mute italic">This message was deleted</div>
          ) : emojiOnly ? (
            <div className="px-1 text-5xl leading-none">{m.body}</div>
          ) : (
            <div className={`${shape} ${skin} ${m.kind === "image" ? "p-1" : rich ? "p-5" : "px-[18px] py-3"}`}>
              {m.replyTo && (
                <button onClick={(e) => { e.stopPropagation(); const el = document.getElementById(`m-${m.replyTo!.id}`); el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.animate([{ background: "rgb(255 255 255 / .1)" }, { background: "transparent" }], { duration: 1200 }); }}
                  className={`mb-2.5 block w-full rounded-xl border-l-2 px-3 py-1.5 text-left text-xs ${solid ? "border-black/60 bg-black/[0.06]" : "border-white/60 bg-white/[0.06]"}`}>
                  <b className="mb-0.5 block font-display text-[13px] font-medium opacity-90">{s.users[m.replyTo.senderId]?.displayName ?? "Someone"}</b>
                  <span className="line-clamp-1 opacity-65">{m.replyTo.kind === "image" ? "Photo" : m.replyTo.body || "…"}</span>
                </button>
              )}
              {m.kind === "text" && (editing ? (
                <div className="min-w-[230px]" onClick={(e) => e.stopPropagation()}>
                  <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} aria-label="Edit message"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(); } if (e.key === "Escape") setEditing(false); }}
                    className="w-full resize-none rounded-lg border border-black/20 bg-black/[0.06] p-2 text-sm outline-none" />
                  <div className="mt-1.5 flex justify-end gap-4 text-xs"><button onClick={() => setEditing(false)}>Cancel</button><button onClick={saveEdit} className="font-bold">Save</button></div>
                </div>
              ) : (
                <p className="text-[15.5px] leading-[1.5] break-words whitespace-pre-wrap">
                  {highlight ? <Highlight text={m.body} q={highlight} /> : <Linkified text={m.body} />}
                </p>
              ))}
              {m.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.body} alt="Shared image" loading="lazy" onClick={(e) => { e.stopPropagation(); onImage(m.body); }}
                  className="max-h-80 max-w-full cursor-zoom-in rounded-[18px] object-cover transition hover:brightness-110" />
              )}
              {m.kind === "voice" && <VoiceBubble m={m} mine={mine} />}
              {m.kind === "roll" && <Roll m={m} who={mine ? "You" : sender?.displayName} />}
              {m.kind === "flip" && <Flip m={m} who={mine ? "You" : sender?.displayName} />}
              {m.kind === "ball" && <Ball m={m} />}
              {m.kind === "poll" && <Poll m={m} users={s.users} meId={me.id} />}
              {m.kind === "ttt" && <Ttt m={m} users={s.users} meId={me.id} />}
              {m.kind === "c4" && <ConnectFour m={m} users={s.users} meId={me.id} />}
              {m.kind === "rps" && <Rps m={m} users={s.users} meId={me.id} />}
              {m.kind === "prompt" && <Prompt m={m} who={mine ? "You" : sender?.displayName} />}
              {m.kind !== "image" && !editing && (
                <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[10.5px] tracking-wide ${ink}`}>
                  {m.editedAt && <span>edited ·</span>}<span>{clock(m.createdAt)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {m.reactions.length > 0 && (
          <div className={`-mt-2 flex flex-wrap gap-1 ${mine ? "mr-2 justify-end" : "ml-2"} relative z-10`}>
            <AnimatePresence initial={false}>
              {m.reactions.map((r) => {
                const meIn = r.userIds.includes(me.id);
                return (
                  <motion.button key={r.emoji} initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} whileTap={{ scale: 0.85 }}
                    onClick={() => react(m.id, r.emoji)} title={r.userIds.map((id) => s.users[id]?.displayName).filter(Boolean).join(", ")}
                    className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${meIn ? "border-white bg-white text-black" : "border-white/20 bg-black text-white"}`}>
                    <span>{r.emoji}</span><span className="text-[11px]">{r.userIds.length}</span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {seen && (
          <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 mr-1 flex items-center gap-1.5 text-[11.5px] text-mute italic">
            {seen.startsWith("Seen") ? <CheckCheck size={12} className="text-white" /> : <Check size={12} />}{seen}
          </motion.span>
        )}
      </div>
    </div>
  );
}

const Tool = ({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) => (
  <button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={label} title={label}
    className="grid h-8 w-8 place-items-center rounded-full text-mute transition hover:bg-white/10 hover:text-white">{children}</button>
);

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-black px-0.5 text-white">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** True only when the message was created moments ago — old rolls/flips should just show their result. */
const useFresh = (ts: number, ms: number) => {
  const [fresh] = useState(() => Date.now() - ts < ms);
  return fresh;
};

/* ───────────── rich cards ───────────── */

function Roll({ m, who }: { m: Message; who?: string }) {
  const d = m.data as RollData;
  const fresh = useFresh(m.createdAt, 4000);
  const [rolling, setRolling] = useState(fresh);
  useEffect(() => { if (!fresh) return; const t = setTimeout(() => setRolling(false), 1100); return () => clearTimeout(t); }, [fresh]);
  return (
    <div className="flex items-center gap-5 pr-2">
      <div className="grid h-16 w-16 place-items-center [perspective:300px]">
        {rolling ? (
          <div className="dice3d">{[1, 2, 3, 4, 5, 6].map((f) => <b key={f}>{f}</b>)}</div>
        ) : (
          <motion.div initial={{ scale: 0.4, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}
            className="grid h-14 min-w-14 place-items-center rounded-xl border border-white/70 bg-black px-2 font-display text-3xl">{d.result}</motion.div>
        )}
      </div>
      <div className="text-sm"><b className="font-display text-[17px] font-medium">{who}</b> rolled a <span className="font-mono text-xs">d{d.sides}</span>
        <div className="mt-1 text-[12.5px] text-mute italic">{rolling ? "rolling…" : d.result === d.sides ? "A critical." : d.result === 1 ? "Ouch." : `Got ${d.result}.`}</div></div>
    </div>
  );
}

function Flip({ m, who }: { m: Message; who?: string }) {
  const d = m.data as FlipData;
  const fresh = useFresh(m.createdAt, 4000);
  const end = d.result === "heads" ? 1800 : 1980;
  return (
    <div className="flex items-center gap-5 pr-2">
      <div className="grid h-[76px] w-[76px] shrink-0 place-items-center [perspective:400px]">
        <div className="coin3d" style={{ ["--end" as string]: `${end}deg`, ...(fresh ? {} : { animation: "none", transform: `rotateY(${end}deg)` }) }}><b>H</b><b>T</b></div>
      </div>
      <div className="text-sm"><b className="font-display text-[17px] font-medium">{who}</b> flipped a coin<div className="mt-1 font-display text-2xl italic">{d.result}</div></div>
    </div>
  );
}

function Ball({ m }: { m: Message }) {
  const d = m.data as BallData;
  const fresh = useFresh(m.createdAt, 4000);
  const [shaking, setShaking] = useState(fresh);
  useEffect(() => { if (!fresh) return; const t = setTimeout(() => setShaking(false), 1000); return () => clearTimeout(t); }, [fresh]);
  return (
    <div className="flex items-center gap-5 pr-2">
      <div className={`ball ${shaking ? "shaking" : ""}`}><div className="win">8</div></div>
      <div className="min-w-0 text-sm">
        <div className="text-white/55 italic">“{d.question}”</div>
        {!shaking && <div className="mt-1.5 font-display text-xl leading-snug" style={{ animation: "reveal .4s both" }}>{d.answer}</div>}
      </div>
    </div>
  );
}

function Poll({ m, users, meId }: { m: Message; users: Record<string, User>; meId: string }) {
  const { act } = useOnyx();
  const d = m.data as PollData;
  const total = d.options.reduce((n, o) => n + o.votes.length, 0);
  return (
    <div className="min-w-[270px]">
      <div className="label mb-3">Poll · {total} vote{total === 1 ? "" : "s"}</div>
      <div className="mb-4 font-display text-[22px] leading-tight">{d.question}</div>
      <div className="space-y-2">
        {d.options.map((o, i) => {
          const pct = total ? (o.votes.length / total) * 100 : 0;
          const mineVote = o.votes.includes(meId);
          return (
            <button key={i} onClick={() => act(m.id, { option: i })} aria-pressed={mineVote}
              className={`relative flex w-full items-center justify-between overflow-hidden rounded-xl border px-4 py-2.5 text-left text-sm transition ${mineVote ? "border-white" : "border-white/14 hover:border-white/45"}`}>
              <motion.span className="absolute inset-y-0 left-0 bg-white/[0.13]" initial={false} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 160, damping: 22 }} />
              <span className="relative flex items-center gap-2">{mineVote && <Check size={13} />}{o.text}</span>
              <span className="relative flex items-center gap-2">
                <span className="flex -space-x-1.5">{o.votes.slice(0, 3).map((id) => <Avatar key={id} user={users[id]} size={18} ring={false} className="ring-1 ring-black" />)}</span>
                <span className="text-[12px] text-white/70">{o.votes.length}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Ttt({ m, users, meId }: { m: Message; users: Record<string, User>; meId: string }) {
  const { act } = useOnyx();
  const g = m.data as TttData;
  const nameX = users[g.x]?.displayName ?? "X";
  const nameO = g.o ? users[g.o]?.displayName ?? "O" : "Challenger";
  const myTurn = !g.winner && ((g.turn === "X" && meId === g.x) || (g.turn === "O" && meId !== g.x && (!g.o || g.o === meId)));
  const status = g.winner === "draw" ? "A draw" : g.winner ? `${g.winner === "X" ? nameX : nameO} wins` : myTurn ? "Your move" : `Waiting for ${g.turn === "X" ? nameX : nameO}`;
  return (
    <div className="[perspective:700px]">
      <div className="label mb-3 flex items-center justify-between gap-6"><span>✕ {nameX}</span><span>◯ {nameO}</span></div>
      <div className="grid grid-cols-3 gap-1.5">
        {g.board.map((c, i) => {
          const win = g.line?.includes(i);
          return (
            <button key={i} disabled={!!c || !myTurn} onClick={() => act(m.id, { cell: i })} aria-label={`Cell ${i + 1}${c ? `, ${c}` : ""}`}
              className={`grid h-14 w-14 place-items-center rounded-xl border text-2xl transition ${win ? "border-white bg-white text-black" : "border-white/14 bg-black"} ${!c && myTurn ? "cursor-pointer hover:border-white hover:bg-white/10" : "cursor-default"}`}>
              {c && <motion.span initial={{ rotateY: 180, scale: 0.2, opacity: 0 }} animate={{ rotateY: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} className="font-display">{c === "X" ? "✕" : "◯"}</motion.span>}
            </button>
          );
        })}
      </div>
      <div role="status" className={`mt-3 text-center text-[13px] italic ${myTurn || g.winner ? "text-white" : "text-mute"}`}>{status}</div>
    </div>
  );
}

function ConnectFour({ m, users, meId }: { m: Message; users: Record<string, User>; meId: string }) {
  const { act } = useOnyx();
  const g = m.data as C4Data;
  const fresh = useFresh(m.createdAt, 8000);
  const nameX = users[g.x]?.displayName ?? "X";
  const nameO = g.o ? users[g.o]?.displayName ?? "O" : "Challenger";
  const myTurn = !g.winner && ((g.turn === "X" && meId === g.x) || (g.turn === "O" && meId !== g.x && (!g.o || g.o === meId)));
  const status = g.winner === "draw" ? "A draw" : g.winner ? `${g.winner === "X" ? nameX : nameO} connects four` : myTurn ? "Your move" : `Waiting for ${g.turn === "X" ? nameX : nameO}`;
  return (
    <div className="[perspective:700px]">
      <div className="label mb-3 flex items-center justify-between gap-6"><span>○ {nameX}</span><span>● {nameO}</span></div>
      <div className="grid grid-cols-7 gap-1 rounded-2xl border border-white/12 bg-black p-2">
        {Array.from({ length: 7 }, (_, col) => {
          const full = !!g.board[col];
          return (
            <button key={col} disabled={!myTurn || full} onClick={() => act(m.id, { col })} aria-label={`Drop in column ${col + 1}`}
              className={`flex flex-col gap-1 rounded-lg p-0.5 transition ${myTurn && !full ? "cursor-pointer hover:bg-white/10" : "cursor-default"}`}>
              {Array.from({ length: 6 }, (_, row) => {
                const idx = row * 7 + col, c = g.board[idx], win = g.line?.includes(idx);
                return (
                  <span key={row} className="relative grid h-8 w-8 place-items-center rounded-full bg-white/[0.04] shadow-[0_0_0_1px_rgb(255_255_255/.08)_inset] sm:h-9 sm:w-9">
                    {c && (
                      <span className={`absolute inset-[3px] rounded-full ${c === "X" ? "bg-[radial-gradient(circle_at_30%_25%,#fff,#bdbdc4)]" : "bg-[radial-gradient(circle_at_30%_25%,#3a3a40,#050506)] ring-1 ring-white/70"} ${win ? "shadow-[0_0_14px_2px_rgb(255_255_255/.8)]" : ""}`}
                        style={g.last === idx && fresh ? { ["--from" as string]: `${-(row + 1) * 40}px`, animation: "drop .55s cubic-bezier(.55,0,.9,.4) both" } : undefined} />
                    )}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>
      <div role="status" className={`mt-3 text-center text-[13px] italic ${myTurn || g.winner ? "text-white" : "text-mute"}`}>{status}</div>
    </div>
  );
}

const RPS: Record<RpsPick, { label: string; icon: typeof Mountain }> = { r: { label: "Rock", icon: Mountain }, p: { label: "Paper", icon: Scroll }, s: { label: "Scissors", icon: Scissors } };

function Rps({ m, users, meId }: { m: Message; users: Record<string, User>; meId: string }) {
  const { act } = useOnyx();
  const d = m.data as RpsData;
  const iPicked = d.picked.includes(meId);
  const full = d.players.length >= 2 && !d.players.includes(meId);
  const winnerName = d.result?.winner ? (d.result.winner === meId ? "You win" : `${users[d.result.winner]?.displayName ?? "Someone"} wins`) : "A draw";
  return (
    <div className="min-w-[260px] [perspective:700px]">
      <div className="label mb-3">Rock · Paper · Scissors</div>
      <div className="mb-4 flex items-center justify-center gap-5">
        {[0, 1].map((slot) => {
          const pid = d.players[slot];
          const pick = pid && d.result ? d.result.picks[pid] : null;
          const Icon = pick ? RPS[pick].icon : null;
          return (
            <div key={slot} className="flex flex-col items-center gap-2">
              <motion.div animate={d.result ? { rotateY: [90, 0] } : {}} transition={{ duration: 0.7, delay: slot * 0.25, ease: [0.2, 0.8, 0.2, 1] }}
                className={`grid h-20 w-16 place-items-center rounded-xl border ${pid && d.picked.includes(pid) ? "border-white" : "border-white/14"} ${d.result?.winner && d.result.winner === pid ? "bg-white text-black shadow-[0_0_30px_-4px_#fff]" : "bg-black"}`}>
                {Icon ? <Icon size={26} strokeWidth={1.4} /> : <span className="font-display text-2xl text-mute">{pid && d.picked.includes(pid) ? "✓" : "?"}</span>}
              </motion.div>
              <div className="flex items-center gap-1.5 text-[12px] text-mute">{pid ? <><Avatar user={users[pid]} size={16} ring={false} />{pid === meId ? "You" : users[pid]?.displayName}</> : "Open seat"}</div>
            </div>
          );
        })}
      </div>
      {d.result ? (
        <div role="status" className="text-center font-display text-2xl italic">{winnerName}</div>
      ) : iPicked ? (
        <div role="status" className="text-center text-[13px] text-mute italic">Locked in — waiting for the other player…</div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {(["r", "p", "s"] as RpsPick[]).map((k) => {
            const I = RPS[k].icon;
            return (
              <button key={k} disabled={full} onClick={() => act(m.id, { pick: k })} aria-label={RPS[k].label}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-white/14 py-3 text-[11.5px] text-mute transition hover:border-white hover:text-white disabled:opacity-40"><I size={20} strokeWidth={1.4} />{RPS[k].label}</button>
            );
          })}
        </div>
      )}
      {full && !d.result && <p className="mt-2 text-center text-[12px] text-dim">Two players already in.</p>}
    </div>
  );
}

function Prompt({ m, who }: { m: Message; who?: string }) {
  const d = m.data as PromptData;
  return (
    <div className="max-w-[340px]">
      <div className="label mb-3">{d.type === "truth" ? "Truth" : "Dare"} · for everyone</div>
      <p className="font-display text-[26px] leading-[1.15]">“{d.text}”</p>
      <p className="mt-4 text-[12px] text-mute italic">Drawn by {who}</p>
    </div>
  );
}
