"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp, Bomb, CircleDot, CircleHelp, Coins, Dices, Flame, Grid3x3, Hand, Heart, ImagePlus, MessageCircleQuestion, Mic,
  PartyPopper, PenLine, Smile, Snowflake, Sparkles, Swords, Vote, X, Zap, Disc3, Scale,
} from "lucide-react";
import { useActions } from "@/lib/client/store";
import { imageToDataUrl } from "@/lib/client/api";
import type { Message } from "@/lib/types";
import { SketchPad } from "./SketchPad";
import { Spinner } from "./Loader";
import { VoiceRecorder, type VoiceClip } from "./Voice";

const EMOJI: Record<string, string[]> = {
  "😀": "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😎 🥳 🤓 🧐 😏 😒 🙄 😬 😴 🤔 🫠 😢 😭 😤 😡 🤯 😱 🥺 🫡".split(" "),
  "👋": "👋 🤚 ✋ 👌 🤌 ✌️ 🤞 🫶 🤙 👍 👎 👊 🙌 👏 🙏 💪 🫰 🤝 ☝️ 👀 🧠 💀 👻 👽 🤖 💩 🔥 ✨ ⚡ 💥 💫 🌈".split(" "),
  "❤️": "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💖 💗 💓 💞 💕 💘 💝 💔 ❤️‍🔥 😻 💋 🌹 🥀 🌙 ⭐ 🌟 🎵 🎶 🎧 🎤 🎸".split(" "),
  "🎉": "🎉 🎊 🎈 🎁 🏆 🥇 🎯 🎮 🕹️ 🎲 🎰 🍕 🍔 🍟 🌮 🍣 🍩 🍪 🍫 🍿 ☕ 🧋 🍺 🥂 🍷 🚀 🛸 🌍 🏝️ 🌋 🐱 🐶 🦄 🐉".split(" "),
};
const RECENT_KEY = "nocturne:recent-emoji";
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } };

const COMMANDS = [
  { cmd: "/roll", arg: "d20", desc: "Roll a die", icon: Dices },
  { cmd: "/flip", arg: "", desc: "Flip a coin", icon: Coins },
  { cmd: "/8ball", arg: "question", desc: "Ask the 8-ball", icon: CircleHelp },
  { cmd: "/spin", arg: "question", desc: "Spin the wheel", icon: Disc3 },
  { cmd: "/wyr", arg: "A | B", desc: "Would you rather", icon: Scale },
  { cmd: "/poll", arg: "Question | a | b", desc: "Start a poll", icon: Vote },
  { cmd: "/ttt", arg: "", desc: "Tic-Tac-Toe", icon: Grid3x3 },
  { cmd: "/c4", arg: "", desc: "Connect Four", icon: CircleDot },
  { cmd: "/rps", arg: "", desc: "Rock Paper Scissors", icon: Hand },
  { cmd: "/truth", arg: "", desc: "Truth prompt", icon: MessageCircleQuestion },
  { cmd: "/dare", arg: "", desc: "Dare prompt", icon: Swords },
  { cmd: "/confetti", arg: "", desc: "Confetti", icon: PartyPopper },
  { cmd: "/hearts", arg: "", desc: "Hearts", icon: Heart },
  { cmd: "/snow", arg: "", desc: "Snowfall", icon: Snowflake },
  { cmd: "/stars", arg: "", desc: "Starfield", icon: Sparkles },
  { cmd: "/fire", arg: "", desc: "Fire", icon: Flame },
  { cmd: "/boom", arg: "", desc: "Explosion", icon: Bomb },
  { cmd: "/shrug", arg: "text", desc: "¯\\_(ツ)_/¯", icon: Smile },
];

type Fun = { label: string; text: string; icon: typeof Dices; prefill?: boolean; sketch?: boolean };
const FUN: Fun[] = [
  { label: "Sketch", text: "", icon: PenLine, sketch: true },
  { label: "Roll d20", text: "/roll d20", icon: Dices }, { label: "Flip coin", text: "/flip", icon: Coins },
  { label: "Spin wheel", text: "/spin", icon: Disc3 }, { label: "Would you rather", text: "/wyr", icon: Scale },
  { label: "Tic-Tac-Toe", text: "/ttt", icon: Grid3x3 }, { label: "Connect 4", text: "/c4", icon: CircleDot },
  { label: "Rock·Paper", text: "/rps", icon: Hand }, { label: "8-ball", text: "/8ball ", icon: CircleHelp, prefill: true },
  { label: "Poll", text: "/poll Question | Yes | No", icon: Vote, prefill: true }, { label: "Truth", text: "/truth", icon: MessageCircleQuestion },
  { label: "Dare", text: "/dare", icon: Swords }, { label: "Confetti", text: "/confetti", icon: PartyPopper },
  { label: "Snow", text: "/snow", icon: Snowflake }, { label: "Stars", text: "/stars", icon: Sparkles },
  { label: "Hearts", text: "/hearts", icon: Heart }, { label: "Fire", text: "/fire", icon: Flame }, { label: "Boom", text: "/boom", icon: Bomb },
];

const draftKey = (convId: string) => `nocturne:draft:${convId}`;

type Props = { convId: string; reply: Message | null; replyName?: string; clearReply: () => void; enterToSend: boolean };

/** Memoized: it re-renders only for its own props, so typing events and presence changes elsewhere never touch it. */
export const Composer = memo(function Composer({ convId, reply, replyName, clearReply, enterToSend }: Props) {
  const { send, typing, toast } = useActions();
  const [text, setText] = useState("");
  const [panel, setPanel] = useState<null | "emoji" | "fun">(null);
  const [cat, setCat] = useState("😀");
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sketch, setSketch] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  /* drafts: each chat remembers what you were typing */
  useEffect(() => {
    let draft = "";
    try { draft = localStorage.getItem(draftKey(convId)) ?? ""; } catch { /* storage blocked */ }
    setText(draft); setPanel(null); setRecording(false); setRecent(readRecent());
    ta.current?.focus();
  }, [convId]);
  useEffect(() => {
    const t = setTimeout(() => { try { text ? localStorage.setItem(draftKey(convId), text) : localStorage.removeItem(draftKey(convId)); } catch { /* storage blocked */ } }, 300);
    return () => clearTimeout(t);
  }, [text, convId]);

  useEffect(() => { if (reply) ta.current?.focus(); }, [reply]);
  useEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text]);

  const hints = useMemo(() => {
    const m = /^\/(\w*)$/.exec(text);
    return m ? COMMANDS.filter((c) => c.cmd.slice(1).startsWith(m[1].toLowerCase())) : [];
  }, [text]);

  /** Optimistic: the box empties and the message appears at once; a failure restores a command or leaves a "Retry" bubble. */
  function submit(body = text) {
    const t = body.trim();
    if (!t) return;
    const replyId = reply?.id;
    setText(""); clearReply(); setPanel(null);
    try { localStorage.removeItem(draftKey(convId)); } catch { /* storage blocked */ }
    void send(convId, { body: t, replyTo: replyId }).then((ok) => { if (!ok && t.startsWith("/")) setText((cur) => cur || t); });
    ta.current?.focus();
  }

  async function sendImage(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast("Only images can be attached", "error");
    setBusy(true);
    try {
      const image = await imageToDataUrl(f);
      await send(convId, { image, replyTo: reply?.id });
      clearReply();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't attach image", "error"); }
    setBusy(false);
  }

  const replyId = reply?.id;
  const sendVoice = useCallback(async (v: VoiceClip) => { const ok = await send(convId, { voice: v, replyTo: replyId }); if (ok) clearReply(); return ok; }, [send, convId, replyId, clearReply]);
  const stopRecording = useCallback(() => setRecording(false), []);
  const recErr = useCallback((m: string) => toast(m, "error"), [toast]);

  const insert = (e: string) => {
    setText((t) => t + e); ta.current?.focus();
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 16);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  const pop = "absolute bottom-full z-30 mb-3 card shadow-[0_30px_80px_-20px_#000]";
  const hasText = !!text.trim();
  const cats = recent.length ? { "🕘": recent, ...EMOJI } : EMOJI;

  return (
    <div className="relative border-t border-white/10 bg-gradient-to-t from-black to-[#050506]/80">
      <div className="relative mx-auto w-full max-w-[880px] p-3 md:px-8 md:py-5">
        <AnimatePresence>
          {hints.length > 0 && (
            <motion.ul initial={{ opacity: 0, y: 10, rotateX: -12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: 8 }}
              className={`${pop} right-3 left-3 max-h-72 overflow-y-auto p-1.5 md:right-8 md:left-8`} role="listbox" aria-label="Commands" style={{ transformPerspective: 800 }}>
              {hints.map((c) => (
                <li key={c.cmd}>
                  <button onClick={() => { setText(c.cmd + (c.arg ? " " : "")); ta.current?.focus(); }} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition hover:bg-white/[0.07]">
                    <c.icon size={16} strokeWidth={1.5} className="text-mute" />
                    <span className="font-mono text-xs">{c.cmd}</span><span className="font-mono text-xs text-dim">{c.arg}</span><span className="ml-auto text-[13px] text-mute italic">{c.desc}</span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
          {panel && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setPanel(null)} />
              <motion.div initial={{ opacity: 0, y: 14, rotateX: -16 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: 8 }}
                style={{ transformOrigin: "bottom left", transformPerspective: 800 }} className={`${pop} left-3 w-[min(400px,calc(100%-24px))] p-4 md:left-8`}>
                {panel === "emoji" ? (
                  <>
                    <div className="mb-3 flex gap-1 border-b border-white/10 pb-3">{Object.keys(cats).map((k) => (
                      <button key={k} onClick={() => setCat(k)} className={`grid h-9 w-9 place-items-center rounded-full text-lg transition ${cat === k ? "bg-white/15" : "hover:bg-white/8"}`}>{k}</button>))}</div>
                    <div className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto">
                      {(cats[cat] ?? EMOJI["😀"]).map((e) => <button key={e} onClick={() => insert(e)} className="grid h-9 w-9 place-items-center rounded-lg text-xl transition hover:scale-125 hover:bg-white/10">{e}</button>)}
                    </div>
                  </>
                ) : (
                  <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
                    {FUN.map((f) => (
                      <motion.button key={f.label} whileHover={{ y: -3, rotateX: 10 }} whileTap={{ scale: 0.94 }}
                        onClick={() => { setPanel(null); if (f.sketch) setSketch(true); else if (f.prefill) { setText(f.text); ta.current?.focus(); } else submit(f.text); }}
                        className="flex flex-col items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.02] px-2 py-4 text-center text-[12px] text-mute transition hover:border-white/50 hover:text-white">
                        <f.icon size={19} strokeWidth={1.4} />{f.label}
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {reply && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mb-3 flex items-center gap-3 rounded-2xl border-l-2 border-white bg-white/[0.05] px-4 py-2.5">
                <div className="min-w-0 flex-1"><div className="label text-white">Replying to {replyName}</div>
                  <div className="truncate text-sm text-mute">{reply.kind === "image" ? "Photo" : reply.kind === "voice" ? "Voice message" : reply.body || "…"}</div></div>
                <button onClick={clearReply} aria-label="Cancel reply" className="text-mute hover:text-white"><X size={15} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {recording ? (
          <VoiceRecorder onSend={sendVoice} onCancel={stopRecording} onError={recErr} />
        ) : (
          <div className="flex items-end gap-1">
            <IconBtn className="max-sm:hidden" label="Emoji" active={panel === "emoji"} onClick={() => setPanel(panel === "emoji" ? null : "emoji")}><Smile size={19} strokeWidth={1.5} /></IconBtn>
            <IconBtn label="Games and effects" active={panel === "fun"} onClick={() => setPanel(panel === "fun" ? null : "fun")}><Zap size={19} strokeWidth={1.5} /></IconBtn>
            <IconBtn label="Attach image" onClick={() => file.current?.click()}>{busy ? <Spinner size={16} /> : <ImagePlus size={19} strokeWidth={1.5} />}</IconBtn>
            <IconBtn className="max-sm:hidden" label="Sketch" onClick={() => setSketch(true)}><PenLine size={19} strokeWidth={1.5} /></IconBtn>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void sendImage(e.target.files?.[0]); e.target.value = ""; }} />

            <textarea ref={ta} value={text} rows={1} placeholder="Say something…" title="Type / for commands" aria-label="Message"
              onChange={(e) => { setText(e.target.value); if (e.target.value) typing(convId); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                if (enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey) { e.preventDefault(); submit(); }
              }}
              onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void sendImage(f); } }}
              maxLength={4000} className="box mx-1 max-h-36 min-h-11 flex-1 resize-none px-5 py-2.5 text-[15.5px] placeholder:text-dim" />

            <AnimatePresence mode="wait" initial={false}>
              {hasText ? (
                <motion.button key="send" onClick={() => submit()} aria-label="Send" initial={{ scale: 0.6, rotate: -90, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} whileTap={{ scale: 0.88 }}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[var(--acc-a)] to-[var(--acc-b)] text-black shadow-[0_10px_30px_-10px_rgb(var(--acc-glow)/.6)]"><ArrowUp size={19} strokeWidth={2.2} /></motion.button>
              ) : (
                <motion.button key="mic" onClick={() => setRecording(true)} aria-label="Record a voice message" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} whileTap={{ scale: 0.88 }}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/25 text-white transition hover:border-white hover:bg-white/10"><Mic size={19} strokeWidth={1.6} /></motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
      <SketchPad open={sketch} onClose={() => setSketch(false)} onSend={(image) => send(convId, { image, replyTo: replyId })} />
    </div>
  );
});

const IconBtn = ({ children, label, onClick, active, className = "" }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean; className?: string }) => (
  <button onClick={onClick} aria-label={label} title={label} aria-pressed={active}
    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition ${className} ${active ? "bg-white text-black" : "text-mute hover:bg-white/10 hover:text-white"}`}>
    {children}
  </button>
);
