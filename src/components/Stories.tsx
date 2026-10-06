"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControlsWithThen } from "motion/react";
import { Eye, Heart, ImagePlus, Send, Trash2, X } from "lucide-react";
import { useActions, useOnyx } from "@/lib/client/store";
import { api, imageToDataUrl } from "@/lib/client/api";
import { ago } from "@/lib/client/format";
import type { StoryView } from "@/lib/types";
import type { Post } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Spinner } from "./Loader";
import { Tilt } from "./Tilt";

/** Text-story backdrops. The brand stays black/white; these are tonal studies, not colours. */
export const TONES: { bg: string; ink: string }[] = [
  { bg: "linear-gradient(160deg,#ffffff,#b9b9c0)", ink: "#000" },
  { bg: "radial-gradient(120% 90% at 20% 0%,#2a2a30,#050506 70%)", ink: "#fff" },
  { bg: "linear-gradient(200deg,#d8d8de,#3a3a40 60%,#0a0a0c)", ink: "#fff" },
  { bg: "radial-gradient(90% 70% at 80% 100%,#ffffff55,transparent 60%),#0b0b0d", ink: "#fff" },
  { bg: "linear-gradient(135deg,#0a0a0c,#26262b 50%,#0a0a0c)", ink: "#fff" },
  { bg: "conic-gradient(from 210deg at 30% 70%,#000,#3b3b42,#000,#1a1a1d,#000)", ink: "#fff" },
];

const SEEN_KEY = "onyx:seen-stories";
export function useSeenStories() {
  const [seen, setSeen] = useState<Set<number>>(new Set());
  useEffect(() => { try { setSeen(new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"))); } catch { /* storage blocked */ } }, []);
  const mark = useCallback((id: number) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-300))); } catch { /* storage blocked */ }
      return next;
    });
  }, []);
  return { seen, mark };
}

export { ago };

function StoryFace({ p }: { p: Post }) {
  if (p.image) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {p.body && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-6 pt-20 pb-24"><p className="font-display text-[26px] leading-tight">{p.body}</p></div>}
      </>
    );
  }
  const t = TONES[p.tone] ?? TONES[0];
  return (
    <div className="absolute inset-0 grid place-items-center p-9 text-center" style={{ background: t.bg, color: t.ink }}>
      <p className="display" style={{ fontSize: p.body.length > 90 ? 28 : p.body.length > 40 ? 38 : 50, lineHeight: 1.08 }}>{p.body}</p>
    </div>
  );
}

/** Fullscreen story player: segmented progress, tap zones, hold to pause, 3D-tilted card. */
export function StoryViewer({ startUserId, onClose }: { startUserId: string | null; onClose: () => void }) {
  const { s } = useOnyx();
  const { mark } = useSeenStories();
  const me = s.me!;

  // Group by author: you first, then others by most-recent story.
  const groups = useMemo(() => {
    const by = new Map<string, Post[]>();
    for (const p of s.stories) by.set(p.userId, [...(by.get(p.userId) ?? []), p]);
    return [...by.entries()].sort(([a, pa], [b, pb]) => (a === me.id ? -1 : b === me.id ? 1 : pb[pb.length - 1].createdAt - pa[pa.length - 1].createdAt));
  }, [s.stories, me.id]);

  // Position = (author, index). Until the viewer navigates it simply follows `startUserId`, so the very first
  // frame already shows the right person's story (no flash of someone else's).
  const [pos, setPos] = useState<{ uid: string; i: number } | null>(null);
  const progress = useMotionValue(0);
  const anim = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const open = startUserId !== null;
  useEffect(() => { if (!open) setPos(null); }, [open]);

  const uid = pos?.uid ?? startUserId;
  const i = pos?.i ?? 0;
  const g = Math.max(0, groups.findIndex(([u]) => u === uid));
  const group = groups[g];
  const story = group?.[1][Math.min(i, group[1].length - 1)];

  const next = useCallback(() => {
    if (!group) return onClose();
    if (i < group[1].length - 1) setPos({ uid: group[0], i: i + 1 });
    else if (g < groups.length - 1) setPos({ uid: groups[g + 1][0], i: 0 });
    else onClose();
  }, [group, i, g, groups, onClose]);
  const prev = useCallback(() => {
    if (i > 0) setPos({ uid: group![0], i: i - 1 });
    else if (g > 0) setPos({ uid: groups[g - 1][0], i: Math.max(0, groups[g - 1][1].length - 1) });
    else progress.set(0);
  }, [i, g, group, groups, progress]);

  useEffect(() => {
    if (!open || !story) return;
    mark(story.id);
    if (story.userId !== me.id) void api("POST", `/api/posts/${story.id}/view`).catch(() => {}); // lets the author see who watched
    progress.set(0);
    anim.current = animate(progress, 1, { duration: story.image ? 6 : 5, ease: "linear", onComplete: next });
    return () => anim.current?.stop();
  }, [open, story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) { if (e.key === "Escape") e.target.blur(); return; } // typing a reply
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === " ") { e.preventDefault(); anim.current?.state === "paused" ? anim.current.play() : anim.current?.pause(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose]);

  const author = group ? s.users[group[0]] : undefined;

  return (
    <AnimatePresence>
      {open && story && group && (
        <motion.div role="dialog" aria-modal="true" aria-label="Story" className="fixed inset-0 z-[130] grid place-items-center bg-black [perspective:1400px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {story.image && <div className="absolute inset-0 scale-125 opacity-40 blur-3xl" style={{ backgroundImage: `url(${story.image})`, backgroundSize: "cover" }} />}
          <button onClick={onClose} aria-label="Close story" className="absolute top-5 right-5 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur transition hover:bg-white hover:text-black"><X size={18} /></button>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={story.id} className="relative h-[min(88dvh,820px)] w-[min(94vw,calc(88dvh*0.5625),460px)] overflow-hidden rounded-[28px] border border-white/15 bg-black shadow-[0_60px_160px_-30px_#000]"
              initial={{ opacity: 0, rotateY: 28, scale: 0.92 }} animate={{ opacity: 1, rotateY: 0, scale: 1 }} exit={{ opacity: 0, rotateY: -28, scale: 0.92 }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              onPointerDown={() => anim.current?.pause()} onPointerUp={() => anim.current?.play()} onPointerLeave={() => anim.current?.play()}>
              <StoryFace p={story} />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/70 to-transparent" />
              {/* progress */}
              <div className="absolute inset-x-4 top-4 z-10 flex gap-1.5" aria-hidden>
                {group[1].map((p, k) => (
                  <div key={p.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
                    <motion.div className="h-full origin-left bg-white" style={{ scaleX: k < i ? 1 : k === i ? progress : 0 }} />
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-4 top-8 z-10 flex items-center gap-3">
                <Avatar user={author} size={38} />
                <div className="min-w-0"><div className="font-display text-[19px] leading-none text-white">{group[0] === me.id ? "Your story" : author?.displayName}</div><div className="mt-1 text-[11.5px] text-white/60">{ago(story.createdAt)}</div></div>
              </div>
              {/* tap zones */}
              <button aria-label="Previous" className="absolute inset-y-24 left-0 z-10 w-1/3" onClick={prev} />
              <button aria-label="Next" className="absolute inset-y-24 right-0 z-10 w-2/3" onClick={next} />
              <StoryFooter story={story} mine={group[0] === me.id} pause={() => anim.current?.pause()} play={() => anim.current?.play()} onDeleted={next} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Bottom bar: viewers + delete on your own stories; a reply box and like on everyone else's. */
function StoryFooter({ story, mine, pause, play, onDeleted }: { story: Post; mine: boolean; pause: () => void; play: () => void; onDeleted: () => void }) {
  const { s } = useOnyx();
  const { likePost, deletePost, send, toast } = useActions();
  const me = s.me!;
  const liked = story.likes.includes(me.id);
  const [views, setViews] = useState<StoryView[] | null>(null);
  const [showViews, setShowViews] = useState(false);
  const [text, setText] = useState("");
  const dm = Object.values(s.convs).find((c) => c.kind === "dm" && c.memberIds.includes(story.userId));

  useEffect(() => {
    if (!mine) return;
    let dead = false;
    setViews(null); setShowViews(false);
    api<{ views: StoryView[] }>("GET", `/api/posts/${story.id}/views`).then((r) => { if (!dead) setViews(r.views); }).catch(() => {});
    return () => { dead = true; };
  }, [mine, story.id]);

  async function reply(t: string) {
    const body = t.trim();
    if (!dm || !body) return;
    const quote = story.body ? `↩ “${story.body.slice(0, 50)}”\n` : "↩ your story\n";
    if (await send(dm.id, { body: quote + body })) { setText(""); toast("Reply sent", "ok"); }
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 to-transparent p-5 pt-14" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      {mine ? (
        <>
          {showViews && (
            <div className="mb-3 max-h-40 overflow-y-auto rounded-2xl border border-white/15 bg-black/80 p-2 backdrop-blur">
              {views?.length ? views.map((v) => (
                <div key={v.user.id} className="flex items-center gap-3 px-2 py-1.5"><Avatar user={v.user} size={28} ring={false} /><span className="flex-1 truncate text-[14px]">{v.user.displayName}</span><span className="text-[11px] text-white/50">{ago(v.at)}</span></div>
              )) : <p className="px-3 py-3 text-[13px] text-white/60 italic">No views yet.</p>}
            </div>
          )}
          <div className="flex items-center justify-between">
            <button onClick={() => { setShowViews((v) => !v); showViews ? play() : pause(); }} aria-expanded={showViews} className="flex items-center gap-2 rounded-full border border-white/25 bg-black/40 px-4 py-2.5 text-[13px] backdrop-blur">
              <Eye size={15} /> {views === null ? "…" : views.length} <span className="text-white/60">· {story.likes.length} like{story.likes.length === 1 ? "" : "s"}</span>
            </button>
            <button onClick={() => { deletePost(story.id); onDeleted(); }} aria-label="Delete story" className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/40 backdrop-blur transition hover:bg-white hover:text-black"><Trash2 size={16} /></button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex justify-center gap-2">
            {["❤️", "🔥", "😂", "😮", "👏"].map((e) => <button key={e} onClick={() => void reply(e)} className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-lg backdrop-blur transition hover:scale-125">{e}</button>)}
          </div>
          <div className="flex items-center gap-2.5">
            <form className="flex-1" onSubmit={(e) => { e.preventDefault(); void reply(text); }}>
              <input value={text} onChange={(e) => setText(e.target.value)} onFocus={pause} onBlur={play} maxLength={500} placeholder={dm ? "Reply…" : "Reply unavailable"} disabled={!dm} aria-label="Reply to story"
                className="w-full rounded-full border border-white/30 bg-black/40 px-5 py-3 text-[14px] backdrop-blur outline-none placeholder:text-white/50 focus:border-white" />
            </form>
            <motion.button whileTap={{ scale: 0.8 }} onClick={() => likePost(story.id)} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition ${liked ? "border-white bg-white text-black" : "border-white/30 bg-black/40 text-white backdrop-blur"}`}>
              <Heart size={19} fill={liked ? "currentColor" : "none"} />
            </motion.button>
          </div>
        </>
      )}
    </div>
  );
}

/** Create a story: a line of text on a tonal backdrop, or a photo with an optional caption. */
export function StoryComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createPost, toast } = useOnyx();
  const [mode, setMode] = useState<"text" | "photo">("text");
  const [text, setText] = useState("");
  const [tone, setTone] = useState(1);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setText(""); setImage(null); setMode("text"); } }, [open]);

  async function pick(f?: File) {
    if (!f) return;
    try { setImage(await imageToDataUrl(f, 1000)); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't use that image", "error"); }
  }
  const ready = mode === "text" ? !!text.trim() : !!image;
  async function share() {
    setBusy(true);
    const ok = await createPost({ kind: "story", body: text.trim(), image: mode === "photo" ? image ?? undefined : undefined, tone });
    setBusy(false);
    if (ok) { toast("Story shared", "ok"); onClose(); }
  }

  const preview: Post = { id: 0, userId: "", kind: "story", body: text || (mode === "text" ? "Your words here" : ""), image: mode === "photo" ? image : null, tone, createdAt: Date.now(), likes: [], commentCount: 0 };

  return (
    <Modal open={open} onClose={onClose} title="New story" eyebrow="Gone in 24 hours" width={760}>
      <div className="grid gap-7 sm:grid-cols-[230px_1fr]">
        <Tilt className="relative mx-auto h-[408px] w-[230px] overflow-hidden rounded-3xl border border-white/15" max={6}>
          <StoryFace p={preview} />
        </Tilt>
        <div className="flex flex-col">
          <div className="mb-5 grid grid-cols-2 rounded-full border border-white/14 p-1 text-[12px] tracking-[0.14em] uppercase">
            {(["text", "photo"] as const).map((k) => (
              <button key={k} onClick={() => setMode(k)} className={`rounded-full py-2 transition ${mode === k ? "bg-white font-semibold text-black" : "text-mute hover:text-white"}`}>{k}</button>
            ))}
          </div>
          {mode === "photo" && (
            <button onClick={() => file.current?.click()} className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/25 py-5 text-sm text-mute transition hover:border-white hover:text-white"><ImagePlus size={17} /> {image ? "Choose a different photo" : "Choose a photo"}</button>
          )}
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <label className="block">
            <span className="label">{mode === "text" ? "Your words" : "Caption (optional)"}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={220} rows={4} placeholder={mode === "text" ? "Say it in a line…" : "Add a caption…"}
              className="field mt-1 resize-none" />
          </label>
          {mode === "text" && (
            <div className="mt-5" role="radiogroup" aria-label="Backdrop">
              <span className="label">Backdrop</span>
              <div className="mt-2.5 flex gap-2.5">
                {TONES.map((t, k) => (
                  <button key={k} role="radio" aria-checked={tone === k} aria-label={`Backdrop ${k + 1}`} onClick={() => setTone(k)}
                    className={`h-9 w-9 rounded-full transition ${tone === k ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-black" : "ring-1 ring-white/20"}`} style={{ background: t.bg }} />
                ))}
              </div>
            </div>
          )}
          <button onClick={share} disabled={!ready || busy} className="btn mt-auto w-full justify-between pt-0"><span>Share to story</span>{busy ? <Spinner /> : <Send size={15} />}</button>
        </div>
      </div>
    </Modal>
  );
}
